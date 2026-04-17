/**
 * Seed Email Templates
 * Run this to populate default email templates
 * Usage: node src/seedEmailTemplates.js
 */

require('dotenv').config();
const { connectDB, getDB } = require('./db');
const defaultTemplates = require('./data/defaultEmailTemplates');

async function seedEmailTemplates() {
  try {
    await connectDB();
    const db = getDB();
    
    console.log('🌱 Seeding email templates...');
    
    for (const template of defaultTemplates) {
      const existing = await db.collection('emailTemplates').findOne({ name: template.name });
      
      if (existing) {
        console.log(`⏭️  Template '${template.name}' already exists, skipping...`);
      } else {
        await db.collection('emailTemplates').insertOne({
          ...template,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`✅ Created template: ${template.name}`);
      }
    }
    
    console.log('\n✅ Email templates seeded successfully!');
    console.log(`📧 Total templates: ${defaultTemplates.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seedEmailTemplates();
