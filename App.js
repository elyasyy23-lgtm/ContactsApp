import React, { useState, useLayoutEffect, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, SafeAreaView, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator();

// ==========================================
// 1. صفحه اول
// ==========================================
function HomeScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState('الكل');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      const loadData = async () => {
        try {
          const savedContacts = await AsyncStorage.getItem('@contacts_data');
          if (savedContacts !== null) setContacts(JSON.parse(savedContacts));
        } catch (e) {}
      };
      loadData();
    }, [])
  );

  useEffect(() => {
    const saveData = async () => {
      try {
        await AsyncStorage.setItem('@contacts_data', JSON.stringify(contacts));
      } catch (e) {}
    };
    if (contacts.length > 0) saveData();
  }, [contacts]);

  const availableLetters = ['الكل', ...new Set(contacts.map(c => c.letter))].sort();

  const filteredContacts = contacts.filter(contact => {
    const matchesLetter = selectedLetter === 'الكل' || contact.letter === selectedLetter;
    const matchesSearch = contact.name.toLowerCase().includes(searchText.toLowerCase()) || (contact.phone && contact.phone.includes(searchText));
    return matchesLetter && matchesSearch;
  });

  const calculateBalance = (person) => {
    let totalPayment = 0;
    let totalCredit = 0;
    (person.transactions || []).forEach(t => {
      if (t.type === 'payment') totalPayment += Number(t.amount);
      if (t.type === 'credit') totalCredit += Number(t.amount);
    });
    return totalCredit - totalPayment;
  };

  const confirmDelete = (id, name) => {
    Alert.alert(
      'Delete Customer',
      `Are you sure you want to delete "${name}" completely?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            const updatedContacts = contacts.filter(c => c.id !== id);
            setContacts(updatedContacts);
          } 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={{ fontSize: 24, color: '#fff' }}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerText}>eKhata</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSearchVisible(!isSearchVisible)}>
          <Text style={{ fontSize: 22, color: '#fff' }}>🔍</Text>
        </TouchableOpacity>
      </View>

      {isSearchVisible && (
        <View style={styles.searchContainer}>
          <TextInput style={styles.searchInput} placeholder="Search..." value={searchText} onChangeText={setSearchText} autoFocus={true} />
          <TouchableOpacity onPress={() => { setIsSearchVisible(false); setSearchText(''); }} style={styles.closeSearchBtn}>
             <Text style={{fontSize: 16, color: '#fff'}}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.alphabetContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alphabetScroll}>
          {availableLetters.map((letter) => (
            <TouchableOpacity key={letter} style={[styles.letterButton, selectedLetter === letter && styles.letterButtonActive]} onPress={() => setSelectedLetter(letter)}>
              <Text style={[styles.letterText, selectedLetter === letter && styles.letterTextActive]}>{letter}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.listContainer}>
        {filteredContacts.length === 0 && <Text style={styles.emptyText}>No contacts found.</Text>}
        {filteredContacts.map((contact) => {
          const balance = calculateBalance(contact);
          return (
            <TouchableOpacity 
              key={contact.id} 
              style={styles.listItem} 
              onPress={() => navigation.navigate('CustomerDetail', { contact, contacts, setContacts })}
              onLongPress={() => confirmDelete(contact.id, contact.name)}
              delayLongPress={500} 
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemText}>{contact.name}</Text>
                  {contact.phone ? <Text style={styles.phoneText}>{contact.phone}</Text> : null}
                </View>
                <Text style={[styles.balanceText, { color: balance > 0 ? '#F44336' : (balance < 0 ? '#009688' : '#333') }]}>
                  {balance === 0 ? 'IRR 0' : (balance > 0 ? `IRR ${balance}` : `IRR +${Math.abs(balance)}`)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.floatingButton} onPress={() => navigation.navigate('AddNew', { setContacts, contacts })}>
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ==========================================
// 2. صفحه ثبت جدید / ویرایش
// ==========================================
function AddNewScreen({ navigation, route }) {
  const { setContacts, contacts, editContact } = route.params;
  
  const [name, setName] = useState(editContact ? editContact.name : '');
  const [phone, setPhone] = useState(editContact ? editContact.phone : '');
  const [email, setEmail] = useState(editContact ? editContact.email : '');
  const [address, setAddress] = useState(editContact ? editContact.address : '');

  const handleSave = () => {
    if (name.trim() === '') {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }
    const firstLetter = name.trim().charAt(0).toUpperCase();

    if (editContact) {
      const updatedContacts = contacts.map(c => {
        if (c.id === editContact.id) {
          return { ...c, name: name.trim(), phone: phone.trim(), letter: firstLetter, email: email.trim(), address: address.trim() };
        }
        return c;
      });
      setContacts(updatedContacts);
    } else {
      const newContact = {
        id: Date.now().toString(),
        name: name.trim(), phone: phone.trim(), letter: firstLetter,
        email: email.trim(), address: address.trim(), transactions: [] 
      };
      setContacts([...contacts, newContact]);
    }
    navigation.goBack(); 
  };

  const handleDelete = () => {
    Alert.alert('Delete Customer', `Are you sure?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
            const updatedContacts = contacts.filter(c => c.id !== editContact.id);
            setContacts(updatedContacts);
            navigation.goBack(); 
          } 
        }
      ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editContact ? 'Customer Detail' : 'New Customer',
      headerRight: () => (
        <TouchableOpacity onPress={handleSave} style={{ padding: 10 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>✓</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, name, phone, email, address]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView style={{ padding: 20 }}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
        <Text style={styles.label}>Mobile No</Text>
        <TextInput style={styles.input} placeholder="Mobile No" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Text style={styles.label}>Email Id</Text>
        <TextInput style={styles.input} placeholder="Email Id" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Text style={styles.label}>Address</Text>
        <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} placeholder="Address" value={address} onChangeText={setAddress} multiline={true} numberOfLines={4} />

        {editContact && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>🗑️ Settle and Delete Customer</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ==========================================
// 3. صفحه حساب مشتری (با دکمه‌های SAVE و DELETE در پایین مدال)
// ==========================================
function CustomerDetailScreen({ navigation, route }) {
  const { contact, contacts, setContacts } = route.params;
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState(''); 
  const [amount, setAmount] = useState(''); 
  const [note, setNote] = useState('');
  const [editingTransactionId, setEditingTransactionId] = useState(null);

  // ** ترفند جدید: یک استیت محلی برای ذخیره تراکنش‌ها **
  const [localTransactions, setLocalTransactions] = useState([]);

  useLayoutEffect(() => {
    const currentContact = contacts.find(c => c.id === contact.id) || contact;
    setLocalTransactions([...(currentContact.transactions || [])].reverse());
  }, [contacts, contact.id]);

  const currentContact = contacts.find(c => c.id === contact.id) || contact;
  
  let totalPayment = 0;
  let totalCredit = 0;
  (localTransactions || []).forEach(t => {
    if (t.type === 'payment') totalPayment += Number(t.amount);
    if (t.type === 'credit') totalCredit += Number(t.amount);
  });
  const netBalance = totalCredit - totalPayment;

  const handleSaveTransaction = () => {
    const finalAmount = parseFloat(amount);
    if (isNaN(finalAmount) || finalAmount === 0) { 
      Alert.alert('Error', 'Please enter a valid amount.'); 
      return; 
    }
    
    const now = new Date();
    const transactionData = {
      type: transactionType, 
      amount: finalAmount.toString(), 
      note: note,
      date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    
    let updatedContacts;
    if (editingTransactionId) {
      updatedContacts = contacts.map(c => {
        if (c.id === currentContact.id) {
          const updatedTrans = c.transactions.map(t => 
            t.id === editingTransactionId ? { ...t, ...transactionData } : t
          );
          return { ...c, transactions: updatedTrans };
        }
        return c;
      });
    } else {
      transactionData.id = Date.now().toString();
      updatedContacts = contacts.map(c => {
        if (c.id === currentContact.id) { return { ...c, transactions: [...(c.transactions || []), transactionData] }; }
        return c;
      });
    }
    
    setContacts(updatedContacts); 
    
    // ** این خط باعث میشه بلافاصله لیست و موجودی آپدیت بشن **
    setLocalTransactions(prev => [transactionData, ...prev]);

    setIsModalVisible(false);
  };

  const handleDeleteTransaction = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            const updatedContacts = contacts.map(c => {
              if (c.id === currentContact.id) {
                const filteredTrans = c.transactions.filter(t => t.id !== editingTransactionId);
                return { ...c, transactions: filteredTrans };
              }
              return c;
            });
            setContacts(updatedContacts);
            setLocalTransactions(prev => prev.filter(t => t.id !== editingTransactionId));
            setIsModalVisible(false);
          } 
        }
      ]
    );
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentContact.name,
      headerRight: () => (
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={{ marginRight: 15 }} onPress={() => navigation.navigate('AddNew', { setContacts, contacts, editContact: currentContact })}>
            <Text style={{ fontSize: 20 }}>✏️</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, currentContact]);

  const openNewTransactionModal = (type) => {
    setTransactionType(type);
    setAmount('');
    setNote('');
    setEditingTransactionId(null); 
    setIsModalVisible(true);
  };

  const openEditTransactionModal = (transaction) => {
    setTransactionType(transaction.type);
    setAmount(transaction.amount.toString());
    setNote(transaction.note || '');
    setEditingTransactionId(transaction.id); 
    setIsModalVisible(true);
  };

  const now = new Date();
  const currentDateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const currentTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.detailContainer}>
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={[styles.actionButton, styles.paymentButton]} onPress={() => openNewTransactionModal('payment')}>
          <Text style={styles.actionButtonText}>Accept Payment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.creditButton]} onPress={() => openNewTransactionModal('credit')}>
          <Text style={styles.actionButtonText}>Give Credit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, marginRight: 10, color: '#9575CD' }}>💵</Text>
          <Text style={styles.balanceLabel}>Net Balance</Text>
        </View>
        <Text style={[styles.balanceAmount, { color: netBalance > 0 ? '#F44336' : (netBalance < 0 ? '#009688' : '#333') }]}>
          IRR {netBalance === 0 ? '0' : (netBalance > 0 ? netBalance : `+${Math.abs(netBalance)}`)}
        </Text>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.columnHeader, { flex: 1.5, textAlign: 'left' }]}>Date</Text>
        <Text style={[styles.columnHeader, { flex: 1, color: '#009688' }]}>Payment</Text>
        <Text style={[styles.columnHeader, { flex: 1, color: '#F44336' }]}>Credit</Text>
      </View>

      <ScrollView style={styles.transactionsList}>
        {localTransactions.length === 0 && <Text style={styles.noTransactionText}>No transactions yet.</Text>}
        {localTransactions.map((t) => (
          <TouchableOpacity key={t.id} style={styles.transactionRow} onPress={() => openEditTransactionModal(t)}>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.dateText}>{t.date}</Text>
              <Text style={styles.timeText}>{t.time}</Text>
            </View>
            <Text style={[styles.amountText, { flex: 1, color: '#009688' }]}>{t.type === 'payment' ? `IRR ${t.amount}` : '-'}</Text>
            <Text style={[styles.amountText, { flex: 1, color: '#F44336' }]}>{t.type === 'credit' ? `IRR ${t.amount}` : '-'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalBox}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>{transactionType === 'payment' ? 'Accept Payment' : 'Give Credit'}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#000' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalDateTime}>
              <Text style={styles.modalIcon}>📅</Text>
              <Text style={styles.modalDateTimeText}>{currentDateStr}</Text>
              <Text style={styles.modalIcon}>🕒</Text>
              <Text style={styles.modalDateTimeText}>{currentTimeStr}</Text>
            </View>

            <View style={styles.amountContainer}>
              <Text style={[styles.currencyLabel, { color: transactionType === 'payment' ? '#009688' : '#F44336' }]}>IRR</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="Amount"
                autoFocus={true}
              />
            </View>

            <Text style={styles.noteLabel}>Note:</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="note"
              value={note}
              onChangeText={setNote}
            />

            <View style={styles.modalButtonsContainer}>
              {editingTransactionId && (
                <TouchableOpacity style={styles.deleteModalBtn} onPress={handleDeleteTransaction}>
                  <Text style={styles.deleteModalBtnText}>DELETE</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.saveModalBtn} onPress={handleSaveTransaction}>
                <Text style={styles.saveModalBtnText}>SAVE</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ==========================================
// ناوبری اصلی
// ==========================================
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#9575CD' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: 'bold' }, headerTitleAlign: 'center' }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddNew" component={AddNewScreen} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ==========================================
// استایل‌ها
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4fa' },
  header: { backgroundColor: '#9575CD', paddingTop: 40, paddingBottom: 15, paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  iconBtn: { padding: 8 },
  searchContainer: { backgroundColor: '#7E57C2', padding: 15, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 10, fontSize: 16 },
  closeSearchBtn: { marginLeft: 10, padding: 10, backgroundColor: '#4a3b68', borderRadius: 8 },
  alphabetContainer: { backgroundColor: '#7E57C2', paddingVertical: 12 },
  alphabetScroll: { paddingHorizontal: 10 },
  letterButton: { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 5, elevation: 1 },
  letterButtonActive: { backgroundColor: '#4a3b68' },
  letterText: { fontSize: 16, color: '#333', fontWeight: 'bold' },
  letterTextActive: { color: 'white' },
  listContainer: { padding: 15 },
  listItem: { backgroundColor: 'white', padding: 18, marginBottom: 12, borderRadius: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  listItemText: { fontSize: 18, color: '#333', fontWeight: 'bold' },
  phoneText: { fontSize: 14, color: '#666', marginTop: 5 },
  balanceText: { fontSize: 17, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 20, fontSize: 16, color: '#888' },
  floatingButton: { position: 'absolute', width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#9575CD', justifyContent: 'center', alignItems: 'center', right: 25, bottom: 50, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  floatingButtonText: { color: 'white', fontSize: 38, fontWeight: '300', marginTop: -4 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, marginTop: 15, color: '#333' },
  input: { backgroundColor: 'white', borderRadius: 10, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  deleteButton: { backgroundColor: 'white', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30, borderWidth: 1, borderColor: '#ffcccc' },
  deleteButtonText: { color: '#F44336', fontSize: 16, fontWeight: 'bold' },
  detailContainer: { flex: 1, backgroundColor: '#f5f4fa', padding: 15 },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  actionButton: { flex: 1, padding: 15, borderRadius: 25, alignItems: 'center', marginHorizontal: 5, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  paymentButton: { backgroundColor: '#009688' }, 
  creditButton: { backgroundColor: '#F44336' }, 
  actionButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  balanceCard: { backgroundColor: 'white', padding: 18, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  balanceLabel: { fontSize: 16, color: '#666' },
  balanceAmount: { fontSize: 19, fontWeight: 'bold' },
  tableHeader: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  columnHeader: { fontWeight: 'bold', fontSize: 16 },
  transactionsList: { flex: 1 },
  transactionRow: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  dateText: { fontSize: 16, color: '#333', fontWeight: 'bold' },
  timeText: { fontSize: 12, color: '#888', marginTop: 5 },
  amountText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  noTransactionText: { textAlign: 'center', color: '#888', marginTop: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#f9f9f9', width: '95%', borderRadius: 15, paddingBottom: 20, overflow: 'hidden' },
  modalHeader: { backgroundColor: '#9575CD', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalHeaderText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalCloseBtn: { backgroundColor: 'white', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 3 },
  modalDateTime: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15 },
  modalIcon: { fontSize: 18, color: '#9575CD', marginRight: 5 },
  modalDateTimeText: { fontSize: 14, color: '#666', marginRight: 15 },
  amountContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  currencyLabel: { fontSize: 26, fontWeight: 'bold', marginRight: 5 },
  amountInput: { fontSize: 28, borderBottomWidth: 2, borderColor: '#ccc', minWidth: 120, paddingBottom: 5, textAlign: 'center' },
  noteLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 20, marginTop: 25 },
  noteInput: { borderBottomWidth: 1, borderColor: '#ccc', marginHorizontal: 20, paddingVertical: 8, fontSize: 16 },
  modalButtonsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, paddingHorizontal: 20 },
  saveModalBtn: { backgroundColor: '#9575CD', flex: 1, padding: 15, borderRadius: 25, alignItems: 'center', elevation: 3, marginLeft: 10 },
  saveModalBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  deleteModalBtn: { backgroundColor: '#F44336', flex: 1, padding: 15, borderRadius: 25, alignItems: 'center', elevation: 3, marginRight: 10 },
  deleteModalBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
