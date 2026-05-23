const { ForbiddenError } = require('../utils/errors');

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Role '${req.user.role}' is not authorized to access this resource`)
      );
    }

    next();
  };
};

module.exports = { authorize };
