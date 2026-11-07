const handleSaveTransaction = () => {
  console.log("🔴 دکمه SAVE فشرده شد!");
  
  const finalAmount = parseFloat(amount);
  
  if (isNaN(finalAmount) || finalAmount === 0) { 
    Alert.alert('Error', 'Please enter a valid amount.'); 
    return; 
  }
  
  const now = new Date();
  const newTransaction = {
    id: Date.now().toString(), 
    type: transactionType, 
    amount: finalAmount.toString(), 
    note: note,
    date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
  
  // 1. ساختن لیست جدید
  const updatedContacts = contacts.map(c => {
    if (c.id === currentContact.id) { 
      return { ...c, transactions: [...(c.transactions || []), newTransaction] }; 
    }
    return c;
  });
  
  // 2. آپدیت کردن استیت اصلی
  setContacts(updatedContacts); 
  
  // 3. آپدیت کردن استیت محلی بلافاصله (این خط مشکل نمایش را حل می‌کند)
  setLocalTransactions(prev => [newTransaction, ...prev]);

  // 4. بستن مدال
  setIsModalVisible(false);
};
