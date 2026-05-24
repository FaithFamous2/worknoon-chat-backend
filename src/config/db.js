const mongoose = require('mongoose');
const dns = require('dns');

// Use Google DNS for reliable Atlas SRV resolution
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MAX_RETRIES = 20;
const RETRY_DELAY = 3000;

const connectDB = async (retryCount = 0) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      retryWrites: true,
      w: 'majority',
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    const msg = (error.message || error.code || 'Unknown error').substring(0, 150);
    console.error(`MongoDB Connection Error (attempt ${retryCount + 1}/${MAX_RETRIES}): ${msg}`);

    if (retryCount < MAX_RETRIES - 1) {
      console.log(`Retrying in ${RETRY_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectDB(retryCount + 1);
    }

    console.error('All connection attempts failed. Check your network and whitelist.');
    process.exit(1);
  }
};

module.exports = connectDB;
