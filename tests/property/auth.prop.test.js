const { ensureAuthenticated } = require('../../src/web/middleware/auth');

describe('Auth Validation', () => {
  test('Property 20: protected routes redirect to /login without session', () => {
    const req = { 
      isAuthenticated: jest.fn(() => false),
      session: {} 
    };
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('Property 21: valid session accesses routes', () => {
    const req = { 
      isAuthenticated: jest.fn(() => true),
      user: { id: 1, isAdmin: true },
      session: { user: { id: 1 } } 
    };
    const res = { redirect: jest.fn() };
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
