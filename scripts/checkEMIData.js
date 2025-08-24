const mongoose = require('mongoose');
const EMI = require('../models/EMI');
const Transaction = require('../models/Transaction');
require('dotenv').config();

async function checkEMIData() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    // Check all EMIs
    const allEMIs = await EMI.find({});
    console.log(`\n📊 Total EMIs in database: ${allEMIs.length}`);

    if (allEMIs.length === 0) {
      console.log('❌ No EMIs found in database');
      process.exit(0);
    }

    // Display EMI details
    console.log('\n💰 EMI Details:');
    allEMIs.forEach((emi, index) => {
      console.log(`\n${index + 1}. ${emi.name}`);
      console.log(`   ID: ${emi._id}`);
      console.log(`   Type: ${emi.type}`);
      console.log(`   Status: ${emi.status}`);
      console.log(`   Monthly Amount: ₹${emi.emiAmount?.toLocaleString() || 'N/A'}`);
      console.log(`   Total Installments: ${emi.totalInstallments || 'N/A'}`);
      console.log(`   Paid Installments: ${emi.paidInstallments || 0}`);
      console.log(`   Remaining Amount: ₹${emi.remainingAmount?.toLocaleString() || 'N/A'}`);
      console.log(`   Start Date: ${new Date(emi.startDate).toLocaleDateString()}`);
      console.log(`   Next Due Date: ${emi.nextDueDate ? new Date(emi.nextDueDate).toLocaleDateString() : 'N/A'}`);
    });

    // Calculate summary manually
    const activeEMIs = allEMIs.filter(emi => emi.status === 'active');
    const completedEMIs = allEMIs.filter(emi => emi.status === 'completed');
    
    let totalMonthlyEMI = 0;
    let totalRemaining = 0;
    
    activeEMIs.forEach(emi => {
      if (emi.paymentType === 'emi') {
        totalMonthlyEMI += emi.emiAmount || 0;
      }
      totalRemaining += emi.remainingAmount || 0;
    });

    console.log('\n📈 Manual Summary Calculation:');
    console.log(`   Total EMIs: ${allEMIs.length}`);
    console.log(`   Active EMIs: ${activeEMIs.length}`);
    console.log(`   Completed EMIs: ${completedEMIs.length}`);
    console.log(`   Monthly EMI (Active): ₹${totalMonthlyEMI.toLocaleString()}`);
    console.log(`   Total Remaining: ₹${totalRemaining.toLocaleString()}`);

    // Check if there are transactions for these EMIs
    const emiTransactions = await Transaction.find({
      description: { $regex: /installment/i }
    });
    
    console.log(`\n💳 EMI-related Transactions: ${emiTransactions.length}`);
    if (emiTransactions.length > 0) {
      console.log('   Sample transactions:');
      emiTransactions.slice(0, 5).forEach(tx => {
        console.log(`   - ${new Date(tx.date).toLocaleDateString()}: ₹${tx.amount} (${tx.description})`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking EMI data:', error);
    process.exit(1);
  }
}

// Run the script
checkEMIData();
