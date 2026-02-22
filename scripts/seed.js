const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { randomUUID } = require('crypto');
const path = require('path');

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const Nest = require('../src/models/Nest');

async function seed() {
  const code = process.argv[2];
  const aId  = process.argv[3];
  const bId  = process.argv[4];

  if (!code || !aId || !bId) {
    console.log('Usage: node scripts/seed.js <NestCode> <PartnerALineId> <PartnerBLineId>');
    console.log('Example: node scripts/seed.js LOVE123 U123... U456...');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Check if nest already exists
    let nest = await Nest.findOne({ nestCode: code.toUpperCase() });
    if (nest) {
      console.log(`⚠️ Nest ${code.toUpperCase()} already exists. Updating it...`);
    } else {
      nest = new Nest({
        nestCode: code.toUpperCase(),
        nestName: 'Manually Seeded Nest',
        timezone: 'Asia/Kolkata', // default
      });
    }

    nest.partnerA = {
      lineLoginId: aId,
      lineUserId:  aId,
      name:        'Partner A',
      dmActive:    false,
    };

    nest.partnerB = {
      lineLoginId: bId,
      lineUserId:  bId,
      name:        'Partner B',
      dmActive:    false,
    };

    nest.status = 'pending_line'; // Ready to be /link'd in group chat
    
    await nest.save();
    
    console.log('✅ Success! Nest seeded.');
    console.log('Nest Code:', nest.nestCode);
    console.log('Partner A:', nest.partnerA.lineUserId);
    console.log('Partner B:', nest.partnerB.lineUserId);
    console.log('Status:   ', nest.status);
    console.log('\n💬 Next step: Create a LINE group, add Lumi, and type:');
    console.log(`   /link ${nest.nestCode}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

seed();
