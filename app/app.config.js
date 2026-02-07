const config = require('./app.json');

module.exports = () => {
  const appConfig = { ...config.expo };

  // Override Android package if env var is set
  if (process.env.ANDROID_PACKAGE) {
    appConfig.android = {
      ...appConfig.android,
      package: process.env.ANDROID_PACKAGE,
    };
  }

  return appConfig;
};
