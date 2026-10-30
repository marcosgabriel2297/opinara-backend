import { createHash, randomBytes } from 'crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import SharedConfig from '@shared/config';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { MAILER, Mailer, actionMail } from '@shared/common/mailer';
import { Urn } from '@shared/common/urn';
import {
  BUSINESS_MEMBER_ENTITY,
  Business,
  BusinessMember,
  BusinessMembersRepository,
  BusinessesRepository,
  toPublicBusiness,
} from '@shared/models/business';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { UsersRepository } from '@shared/models/user';

import config from '../config';
import * as DTO from '../dtos';
import {
  BUSINESS_INVITATION_ENTITY,
  BusinessInvitation,
  BusinessInvitationsRepository,
  InvitationStatus,
} from '../models';

const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

const ROLE_LABELS: Record<BusinessMemberRole, string> = {
  [BusinessMemberRole.OWNER]: 'dueño',
  [BusinessMemberRole.ADMIN]: 'administrador',
  [BusinessMemberRole.MEMBER]: 'miembro',
};

export interface MemberView {
  urn: string;
  role: BusinessMemberRole;
  joinedAt?: Date;
  user: { urn: string; name: string; email: string };
}

export interface InvitationView {
  urn: string;
  email: string;
  role: BusinessMemberRole;
  expiresAt: Date;
  createdAt?: Date;
}

export interface TeamView {
  members: MemberView[];
  /** Solo para OWNER y ADMIN, que son quienes invitan. */
  invitations: InvitationView[];
}

export interface InvitationLookup {
  status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
  email: string;
  role: BusinessMemberRole;
  businessName: string;
  invitedByName: string | null;
  /** Si ya hay una cuenta con ese email: la pantalla ofrece entrar en vez de registrarse. */
  accountExists: boolean;
}

const toInvitationView = (invitation: BusinessInvitation): InvitationView => ({
  urn: invitation.urn,
  email: invitation.email,
  role: invitation.role,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

/**
 * El equipo de un business: quienes son, a quien se invito, y los cambios de rol. Reglas:
 * - OWNER hay uno solo (quien creo el negocio): no se invita, no se le cambia el rol, no se lo saca.
 * - El OWNER invita ADMIN o MEMBER y cambia roles; un ADMIN invita y saca solo MEMBER.
 * - Cualquiera que no sea OWNER puede irse por su cuenta.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly membersRepository: BusinessMembersRepository,
    private readonly businessesRepository: BusinessesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly invitationsRepository: BusinessInvitationsRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async team(business: Business, membership: BusinessMember): Promise<TeamView> {
    const members = await this.membersRepository.find(
      { businessUrn: business.urn, status: BusinessMemberStatus.ACTIVE },
      { sort: { createdAt: 'asc' } },
    );
    const users = await this.usersRepository.find({ urn: { $in: members.map((member) => member.userUrn) } });
    const byUrn = new Map(users.map((user) => [user.urn, user]));

    const canInvite = membership.role !== BusinessMemberRole.MEMBER;
    const invitations = canInvite ? await this.invitationsRepository.findPending(business.urn) : [];

    return {
      members: members.flatMap((member) => {
        const user = byUrn.get(member.userUrn);
        if (!user) return [];
        return [
          {
            urn: member.urn,
            role: member.role,
            joinedAt: member.createdAt,
            user: { urn: user.urn, name: user.name, email: user.email },
          },
        ];
      }),
      invitations: invitations.map(toInvitationView),
    };
  }

  /**
   * Invita por email. Devuelve tambien el link: quien invita lo puede pasar por WhatsApp si el mail
   * no llega. Es seguro mostrarselo: la invitacion solo la acepta quien entre con ese email.
   */
  async invite(
    business: Business,
    membership: BusinessMember,
    inviter: AuthenticatedUser,
    payload: DTO.CreateInvitation,
  ): Promise<{ invitation: InvitationView; inviteUrl: string }> {
    if (membership.role === BusinessMemberRole.ADMIN && payload.role !== BusinessMemberRole.MEMBER) {
      Exceptions.forbidden(Errors.MEMBER_ROLE_NOT_ALLOWED);
    }

    const email = payload.email.toLowerCase().trim();
    // No hay registro publico: solo se invita a quien ya tiene cuenta (la da de alta un admin).
    const existing = await this.usersRepository.findByEmail(email);
    if (!existing) {
      return Exceptions.badRequest(Errors.INVITEE_NOT_REGISTERED);
    }
    if (await this.membersRepository.findActiveMembership(business.urn, existing.urn)) {
      Exceptions.conflict(Errors.MEMBER_ALREADY_EXISTS);
    }

    await this.invitationsRepository.revokePendingFor(business.urn, email);

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.invitationsRepository.createOrUpdate({
      urn: Urn.createUUID(BUSINESS_INVITATION_ENTITY),
      businessUrn: business.urn,
      email,
      role: payload.role,
      tokenHash: hashToken(token),
      invitedByUserUrn: inviter.urn,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + config.Invitation.ExpiresInSeconds * 1000),
    });

    // Despues de `#`: el token no llega al servidor del frontend ni sale en el `Referer`.
    const inviteUrl = `${SharedConfig.App.PublicAppBaseUrl}/invitations#token=${token}`;
    await this.sendInvitation(business, inviter, email, payload.role, inviteUrl);

    return { invitation: toInvitationView(invitation), inviteUrl };
  }

  async revokeInvitation(business: Business, invitationUrn: string): Promise<void> {
    const invitation = await this.invitationsRepository.one(invitationUrn);
    if (invitation?.businessUrn !== business.urn || invitation.status !== InvitationStatus.PENDING) {
      return Exceptions.notFound(Errors.INVITATION_NOT_FOUND);
    }

    await this.invitationsRepository.updateOne({ urn: invitation.urn }, { $set: { status: InvitationStatus.REVOKED } });
  }

  /** Solo el OWNER (lo exige el controller), y nunca sobre el OWNER. */
  async updateRole(business: Business, memberUrn: string, payload: DTO.UpdateMember): Promise<MemberView> {
    const target = await this.activeMember(business, memberUrn);
    if (target.role === BusinessMemberRole.OWNER) {
      Exceptions.forbidden(Errors.MEMBER_ROLE_NOT_ALLOWED);
    }

    await this.membersRepository.updateOne({ urn: target.urn }, { $set: { role: payload.role } });
    const user = await this.usersRepository.one(target.userUrn);
    if (!user) return Exceptions.notFound(Errors.MEMBER_NOT_FOUND);

    return {
      urn: target.urn,
      role: payload.role,
      joinedAt: target.createdAt,
      user: { urn: user.urn, name: user.name, email: user.email },
    };
  }

  async remove(business: Business, actor: BusinessMember, memberUrn: string): Promise<void> {
    const target = await this.activeMember(business, memberUrn);
    const leaving = target.userUrn === actor.userUrn;

    const allowed =
      target.role !== BusinessMemberRole.OWNER &&
      (leaving ||
        actor.role === BusinessMemberRole.OWNER ||
        (actor.role === BusinessMemberRole.ADMIN && target.role === BusinessMemberRole.MEMBER));
    if (!allowed) {
      Exceptions.forbidden(Errors.MEMBER_ROLE_NOT_ALLOWED);
    }

    await this.membersRepository.updateOne({ urn: target.urn }, { $set: { status: BusinessMemberStatus.REVOKED } });
  }

  /** Lo que muestra la pantalla de la invitacion antes de aceptarla. No pide sesion. */
  async lookup(payload: DTO.InvitationToken): Promise<InvitationLookup> {
    const invitation = await this.invitationsRepository.findByTokenHash(hashToken(payload.token));
    const business = invitation ? await this.businessesRepository.one(invitation.businessUrn) : null;
    if (!invitation || business?.status !== BusinessStatus.ACTIVE) {
      return Exceptions.notFound(Errors.INVITATION_NOT_FOUND);
    }

    const [inviter, account] = await Promise.all([
      this.usersRepository.one(invitation.invitedByUserUrn),
      this.usersRepository.findByEmail(invitation.email),
    ]);

    return {
      status:
        invitation.status === InvitationStatus.PENDING && invitation.expiresAt <= new Date()
          ? 'EXPIRED'
          : invitation.status,
      email: invitation.email,
      role: invitation.role,
      businessName: business.name,
      invitedByName: inviter?.name ?? null,
      accountExists: account !== null,
    };
  }

  /** Suma al usuario al business. Tiene que haber entrado con el email de la invitacion. */
  async accept(user: AuthenticatedUser, payload: DTO.InvitationToken) {
    const invitation = await this.invitationsRepository.findByTokenHash(hashToken(payload.token));
    if (!invitation) {
      return Exceptions.notFound(Errors.INVITATION_NOT_FOUND);
    }
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt <= new Date()) {
      return Exceptions.badRequest(Errors.INVITATION_INVALID);
    }
    if (invitation.email !== user.email.toLowerCase()) {
      return Exceptions.forbidden(Errors.INVITATION_EMAIL_MISMATCH);
    }

    const business = await this.businessesRepository.one(invitation.businessUrn);
    if (business?.status !== BusinessStatus.ACTIVE) {
      return Exceptions.notFound(Errors.INVITATION_NOT_FOUND);
    }

    if (!(await this.invitationsRepository.markAccepted(invitation.urn, user.urn))) {
      return Exceptions.badRequest(Errors.INVITATION_INVALID);
    }

    // Si ya estuvo (y se fue o lo sacaron), vuelve con el rol de la invitacion. Si ya esta, queda
    // con el que tenga: una invitacion no le baja el rol a nadie.
    const current = await this.membersRepository.findOne({ businessUrn: business.urn, userUrn: user.urn });
    const role = current?.status === BusinessMemberStatus.ACTIVE ? current.role : invitation.role;
    await this.membersRepository.createOrUpdate({
      urn: current?.urn ?? Urn.createUUID(BUSINESS_MEMBER_ENTITY),
      businessUrn: business.urn,
      userUrn: user.urn,
      role,
      status: BusinessMemberStatus.ACTIVE,
    });

    return { ...toPublicBusiness(business), role };
  }

  private async activeMember(business: Business, memberUrn: string): Promise<BusinessMember> {
    const member = await this.membersRepository.one(memberUrn);
    if (member?.businessUrn !== business.urn || member.status !== BusinessMemberStatus.ACTIVE) {
      return Exceptions.notFound(Errors.MEMBER_NOT_FOUND);
    }
    return member;
  }

  /** Si el mail falla, la invitacion queda igual: el link que se devuelve sirve. */
  private async sendInvitation(
    business: Business,
    inviter: AuthenticatedUser,
    email: string,
    role: BusinessMemberRole,
    url: string,
  ): Promise<void> {
    const inviterUser = await this.usersRepository.one(inviter.urn);
    const inviterName = inviterUser?.name ?? 'Alguien';
    const days = Math.round(config.Invitation.ExpiresInSeconds / 86400);

    try {
      await this.mailer.send(
        actionMail({
          to: email,
          subject: `${inviterName} te invitó a ${business.name} en Opinara`,
          paragraphs: [
            `${inviterName} te invitó a sumarte a ${business.name} como ${ROLE_LABELS[role]}.`,
            'Desde Opinara se responden las reseñas de Google del negocio y se arman los QR para pedirlas.',
          ],
          action: { label: 'Ver la invitación', url },
          footnote: `La invitación es para ${email} y vence en ${String(days)} días.`,
        }),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo mandar la invitacion de ${business.urn}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
