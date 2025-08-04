/**
 * Get the base URL for API requests
 * This utility determines the appropriate base URL based on the environment
 */

const getBaseUrl = () => {
  // In development, you might want to use localhost or your dev server
  if (__DEV__) {
    // For React Native development, use your local machine's IP
    // or the development server URL
    return 'http://localhost:3000';  // Adjust this to your development setup
  }
  
  // In production, use your production API URL
  return 'https://your-production-api.com';  // Replace with your actual production URL
};

export { getBaseUrl };
