import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { CUSTOMER_LOGIN_ONLY_MESSAGE, STAFF_LOGIN_ONLY_MESSAGE, authService } from '../../src/modules/auth/auth.service';
import { createCustomer, createModerator, createOwner } from '../helpers/factories';
import app from '../helpers/testApp';

const login = (email: string, password: string, portal?: 'customer' | 'staff') =>
  request(app).post('/api/auth/login').send({ email, password, ...(portal ? { portal } : {}) });

const google = (email: string) => ({ sub: `google-${email}`, email, emailVerified: true, firstName: 'Juan', lastName: 'Cruz' });

describe('Separate sign-in pages for customers (/login) and staff (/login/admin)', () => {
  it('staff sign in on the staff page, and are sent there from the customer page', async () => {
    const owner = await createOwner();
    const moderator = await createModerator();

    for (const staff of [owner, moderator]) {
      const onCustomerPage = await login(staff.user.email, staff.password, 'customer');
      expect(onCustomerPage.status).toBe(403);
      expect(onCustomerPage.body.message).toBe(STAFF_LOGIN_ONLY_MESSAGE);
      expect(onCustomerPage.body.data?.token).toBeUndefined();

      const onStaffPage = await login(staff.user.email, staff.password, 'staff');
      expect(onStaffPage.status).toBe(200);
      expect(onStaffPage.body.data.token).toBeTruthy();
    }
  });

  it('customers sign in on the customer page, and the staff page refuses them', async () => {
    const customer = await createCustomer();

    const onStaffPage = await login(customer.user.email, customer.password, 'staff');
    expect(onStaffPage.status).toBe(403);
    expect(onStaffPage.body.message).toBe(CUSTOMER_LOGIN_ONLY_MESSAGE);

    expect((await login(customer.user.email, customer.password, 'customer')).status).toBe(200);
  });

  it('a wrong password never reveals which page an address belongs to', async () => {
    const owner = await createOwner();

    const response = await login(owner.user.email, 'Wr0ng!Password', 'customer');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('without a portal (older clients) the sign-in works as before', async () => {
    const owner = await createOwner();
    const customer = await createCustomer();

    expect((await login(owner.user.email, owner.password)).status).toBe(200);
    expect((await login(customer.user.email, customer.password)).status).toBe(200);
  });

  it('Google sign-in refuses staff accounts and never links Google to them', async () => {
    const moderator = await createModerator();

    await expect(authService.loginWithGoogle(google(moderator.user.email))).rejects.toMatchObject({ statusCode: 403, message: STAFF_LOGIN_ONLY_MESSAGE });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: moderator.user.id } })).googleId).toBeNull();

    // A staff account that somehow already has a Google link is refused too.
    await prisma.user.update({ where: { id: moderator.user.id }, data: { googleId: 'google-linked-staff' } });
    await expect(authService.loginWithGoogle({ ...google(moderator.user.email), sub: 'google-linked-staff' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
