(async () => {
  const orderId = 'cmn61gozg004nhibf9v17twya';
  
  console.log('=== STEP 1: MARK ORDER AS RETURNED ===');
  const updateRes = await fetch('http://localhost:3000/api/driver/deliveries/' + orderId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'RETURNED' })
  });
  
  const updateData = await updateRes.json();
  console.log('Update response:', JSON.stringify(updateData, null, 2));
  
  console.log('\n=== STEP 2: CHECK DRIVER DELIVERIES FOR 3/26 ===');
  const driverRes = await fetch('http://localhost:3000/api/driver/deliveries?date=2026-03-26');
  const driverData = await driverRes.json();
  
  const returnedOrder = driverData.find(d => d.id === orderId);
  console.log('Found in 3/26 list?', returnedOrder ? 'YES' : 'NO');
  if (returnedOrder) {
    console.log('Status:', returnedOrder.status);
    console.log('Updated At:', returnedOrder.updatedAt);
    console.log('TimeSlot Date:', returnedOrder.delivery?.timeSlot?.date);
  }
  
  console.log('\n=== STEP 3: CHECK 3/27 LIST ===');
  const next26Res = await fetch('http://localhost:3000/api/driver/deliveries?date=2026-03-27');
  const next26Data = await next26Res.json();
  
  const returnedOrder27 = next26Data.find(d => d.id === orderId);
  console.log('Found in 3/27 list?', returnedOrder27 ? 'YES' : 'NO');
  if (returnedOrder27) {
    console.log('Status:', returnedOrder27.status);
    console.log('TimeSlot Date:', returnedOrder27.delivery?.timeSlot?.date);
  }
  
  console.log('\n=== STEP 4: CHECK ADMIN/OPERATOR ORDERS ===');
  const adminRes = await fetch('http://localhost:3000/api/orders?page=1&pageSize=100');
  const adminData = await adminRes.json();
  
  const adminOrder = adminData.data?.find(o => o.id === orderId) || adminData.find(o => o.id === orderId);
  console.log('Found in admin orders?', adminOrder ? 'YES' : 'NO');
  if (adminOrder) {
    console.log('Status:', adminOrder.status);
    console.log('Created At:', adminOrder.createdAt);
    console.log('Updated At:', adminOrder.updatedAt);
  }
})().catch(console.error);
