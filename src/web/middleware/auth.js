module.exports = {
  ensureAuthenticated: function (req, res, next) {
    if (req.isAuthenticated()) {
      // เพิ่มการเช็คว่าต้องเป็น Admin เท่านั้นถึงจะเข้าหลังบ้านได้
      if (req.user && req.user.isAdmin) {
        return next();
      }
      req.session.error_msg = 'ขออภัย เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าฐานข้อมูลได้';
      return res.redirect('/');
    }
    req.session.error_msg = 'กรุณาเข้าสู่ระบบก่อนเข้าใช้งาน';
    res.redirect('/login');
  }
};

