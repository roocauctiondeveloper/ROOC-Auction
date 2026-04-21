module.exports = {
  ensureAuthenticated: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    req.session.error_msg = 'กรุณาเข้าสู่ระบบก่อนเข้าใช้งาน';
    res.redirect('/login');
  }
};
