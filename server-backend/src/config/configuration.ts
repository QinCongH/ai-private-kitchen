export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  langchainApiBaseUrl: process.env.LANGCHAIN_API_BASE_URL || 'http://localhost:8000',
});
