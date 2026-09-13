import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';

import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AllExceptionsFilter } from './all.exception.filter';
import { ErrorResponse } from './error.response';

const buildFilter = () => {
  const replies: { body: ErrorResponse; status: number }[] = [];
  const httpAdapterHost = {
    httpAdapter: {
      getRequestUrl: () => '/api/test',
      reply: (_response: unknown, body: ErrorResponse, status: number) => replies.push({ body, status }),
    },
  } as unknown as HttpAdapterHost;

  const host = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(httpAdapterHost);

  return {
    catch: (exception: unknown): ErrorResponse => {
      filter.catch(exception, host);
      return replies[replies.length - 1].body;
    },
  };
};

describe('AllExceptionsFilter', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('propaga el codigo de dominio de una excepcion propia', () => {
    const body = buildFilter().catch(
      (() => {
        try {
          Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);
        } catch (error) {
          return error;
        }
      })(),
    );

    expect(body).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Business not found',
      errorCode: Errors.BUSINESS_NOT_FOUND,
      path: '/api/test',
    });
  });

  it('normaliza los errores del framework a un codigo estable', () => {
    const notFound = buildFilter().catch(new NotFoundException('Cannot GET /api/no-existe'));
    const throttled = buildFilter().catch(new ThrottlerException());

    expect(notFound.errorCode).toBe(Errors.NOT_FOUND);
    expect(throttled.errorCode).toBe(Errors.TOO_MANY_REQUESTS);
    expect(throttled.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('une los mensajes de validacion del ValidationPipe', () => {
    const body = buildFilter().catch(
      new (class extends NotFoundException {
        constructor() {
          super({ message: ['rating must not be less than 1', 'comment must be a string'], error: 'Bad Request' });
        }
      })(),
    );

    expect(body.message).toBe('rating must not be less than 1, comment must be a string');
  });

  it.each(['production', '', 'staging'])('oculta el detalle de errores no controlados (NODE_ENV=%s)', (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;

    const body = buildFilter().catch(new Error('E11000 duplicate key error collection: opinara.users index: email_1'));

    expect(body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorCode: Errors.INTERNAL_SERVER_ERROR,
    });
    expect(JSON.stringify(body)).not.toContain('E11000');
    expect(JSON.stringify(body)).not.toContain('opinara.users');
  });

  it('muestra el mensaje real fuera de produccion', () => {
    process.env.NODE_ENV = 'dev';

    expect(buildFilter().catch(new Error('boom')).message).toBe('boom');
  });
});
