/**
 * MongoDB Connection Test Script
 * Run this to diagnose connection issues
 */
const mongoose = require('mongoose');

const testConnection = async () => {
  const uri = process.env.MONGODB_URI;

  console.log('Testing MongoDB connection...\n');
  console.log('Connection string (masked):');
  if (uri) {
    const masked = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(masked);
  } else {
    console.log('MONGODB_URI not set!');
    process.exit(1);
  }

  console.log('\nAttempting connection with detailed logging...\n');

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });

    console.log('✅ SUCCESS! Connected to MongoDB');
    console.log(`Host: ${mongoose.connection.host}`);
    console.log(`Database: ${mongoose.connection.name}`);

    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nAvailable collections: ${collections.map(c => c.name).join(', ') || 'None (new database)'}`);

    await mongoose.disconnect();
    console.log('\n✅ Connection test completed successfully');
    process.exit(0);

  } catch (error) {
    console.error('❌ CONNECTION FAILED\n');
    console.error('Error details:');
    console.error(`- Name: ${error.name}`);
    console.error(`- Message: ${error.message}`);
    console.error(`- Code: ${error.code || 'N/A'}`);

    if (error.message.includes('IP that isn\'t whitelisted')) {
      console.error('\n⚠️  IP WHITELIST ISSUE DETECTED');
      console.error('Your current IP is not in the MongoDB Atlas whitelist.');
      console.error('\nTo fix this:');
      console.error('1. Go to MongoDB Atlas (https://cloud.mongodb.com)');
      console.error('2. Select your cluster');
      console.error('3. Click "Network Access" in the left sidebar');
      console.error('4. Click "Add IP Address"');
      console.error('5. Click "Add Current IP Address" OR enter "0.0.0.0/0" to allow all IPs');
    }

    if (error.message.includes('authentication failed')) {
      console.error('\n⚠️  AUTHENTICATION FAILED');
      console.error('Your username or password is incorrect.');
      console.error('\nTo fix this:');
      console.error('1. Go to MongoDB Atlas');
      console.error('2. Click "Database Access"');
      console.error('3. Verify your user credentials');
      console.error('4. Make sure the password in your .env matches exactly');
    }

    if (error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️  DNS/NETWORK ISSUE');
      console.error('Cannot resolve the MongoDB cluster hostname.');
      console.error('\nTo fix this:');
      console.error('1. Check your internet connection');
      console.error('2. Verify the cluster name in your connection string');
      console.error('3. Try using a different DNS server (8.8.8.8, 1.1.1.1)');
    }

    process.exit(1);
  }
};

// Load env vars
require('dotenv').config();
testConnection();
