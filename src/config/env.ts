const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
};

export default env;