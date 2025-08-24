const mongoose = require('mongoose');
const EMI = require('../models/EMI');
require('dotenv').config();

async function testEMISummaryAPI() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    // Simulate the summary calculation that the API does
    const userId = '68a9fa309f4cc06312f240b9'; // Your user ID
    
    const emis = await EMI.find({ user: userId });
    console.log(`\n📊 Found ${emis.length} EMIs for user ${userId}`);

    if (emis.length === 0) {
      console.log('❌ No EMIs found for this user');
      process.exit(0);
    }

    // Calculate summary exactly like the API does
    const summary = {
      total: emis.length,
      active: emis.filter(emi => emi.status === 'active').length,
      completed: emis.filter(emi => emi.status === 'completed').length,
      defaulted: emis.filter(emi => emi.status === 'defaulted').length,
      totalAmount: emis.reduce((sum, emi) => sum + (emi.emiAmount * emi.totalInstallments), 0),
      totalRemaining: emis.reduce((sum, emi) => sum + emi.remainingAmount, 0),
      totalPaid: emis.reduce((sum, emi) => sum + (emi.paidInstallments * emi.emiAmount), 0),
      monthlyEMI: emis.filter(emi => emi.status === 'active')
        .reduce((sum, emi) => sum + emi.emiAmount, 0)
    };

    console.log('\n📈 EMI Summary (API calculation):');
    console.log(`   Total EMIs: ${summary.total}`);
    console.log(`   Active EMIs: ${summary.active}`);
    console.log(`   Completed EMIs: ${summary.completed}`);
    console.log(`   Defaulted EMIs: ${summary.defaulted}`);
    console.log(`   Total Amount: ₹${summary.totalAmount.toLocaleString()}`);
    console.log(`   Total Remaining: ₹${summary.totalRemaining.toLocaleString()}`);
    console.log(`   Total Paid: ₹${summary.totalPaid.toLocaleString()}`);
    console.log(`   Monthly EMI: ₹${summary.monthlyEMI.toLocaleString()}`);

    // Check for any potential issues
    console.log('\n🔍 Data Quality Check:');
    emis.forEach((emi, index) => {
      if (!emi.emiAmount || emi.emiAmount === 0) {
        console.log(`   ⚠️  EMI ${index + 1} (${emi.name}) has no emiAmount`);
      }
      if (!emi.remainingAmount && emi.remainingAmount !== 0) {
        console.log(`   ⚠️  EMI ${index + 1} (${emi.name}) has no remainingAmount`);
      }
      if (!emi.paidInstallments && emi.paidInstallments !== 0) {
        console.log(`   ⚠️  EMI ${index + 1} (${emi.name}) has no paidInstallments`);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing EMI summary API:', error);
    process.exit(1);
  }
}

// Run the script
testEMISummaryAPI();
