// const { MongoClient, ObjectId } = require('mongodb');

// let client;
// let db;

// const connectDB = async () => {
//   if (db) return db;
//   try {
//     client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
//       serverSelectionTimeoutMS: 5000,
//       connectTimeoutMS: 10000,
//     });
//     await client.connect();
//     db = client.db(process.env.MONGODB_DB || 'freshly_db');
//     console.log('✅ MongoDB connected via native driver — db:', db.databaseName);

//     // Create indexes
//     await db.collection('users').createIndex({ phone: 1 }, { unique: true });
//     await db.collection('products').createIndex({ category: 1 });
//     await db.collection('products').createIndex({ isBestseller: -1 });
//     await db.collection('orders').createIndex({ user: 1 });
//     await db.collection('orders').createIndex({ orderId: 1 }, { unique: true, sparse: true });

//     return db;
//   } catch (err) {
//     console.error('❌ MongoDB connection error:', err.message);
//     process.exit(1);
//   }
// };

// const getDB = () => {
//   if (!db) throw new Error('DB not initialized. Call connectDB first.');
//   return db;
// };

// const closeDB = async () => {
//   if (client) {
//     await client.close();
//     db = null;
//     client = null;
//     console.log('MongoDB connection closed');
//   }
// };

// module.exports = { connectDB, getDB, closeDB, ObjectId };
