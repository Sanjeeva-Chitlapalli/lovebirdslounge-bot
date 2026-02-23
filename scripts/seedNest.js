require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Nest = require('../src/models/Nest');

async function seed() {
  try {
    const dataPath = path.join(__dirname, '..', 'nestData.json');
    if (!fs.existsSync(dataPath)) {
      console.error('Error: nestData.json not found in root directory.');
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Connect to database
    if (!process.env.MONGODB_URI) {
      console.error('Error: MONGODB_URI not set in .env');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Generate random 6 character code
    const nestCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const nest = new Nest({
      nestCode,
      nestName: data.nestName,
      partnerA: {
        name: data.partnerA.name,
        lineUserId: data.partnerA?.lineUserId || null,
        gender: data.partnerA?.gender || null
      },
      partnerB: {
        name: data.partnerB.name,
        lineUserId: data.partnerB?.lineUserId || null,
        gender: data.partnerB?.gender || null
      },
      status: 'pending_line' // Set to pending_line so /link command works immediately
    });

    await nest.save();

    console.log('\n✅ Successfully created Nest!');
    console.log('----------------------------------------');
    console.log(`Nest ID (DB): ${nest._id}`);
    console.log(`Nest Code:    ${nest.nestCode}`);
    console.log('----------------------------------------');
    console.log('To link this nest to a group, invite the bot to the group and type:');
    console.log(`\n/link ${nest.nestCode}\n`);
    console.log('----------------------------------------\n');

    process.exit(0);
  } catch (err) {
    console.error('Error seeding nest:', err);
    process.exit(1);
  }
}

seed();
