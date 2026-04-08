const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const ids = ['cmnnbx0u8023111b9edx61ogu','cmnnc61i402bi11b9afr7hk27','cmnolm1jm01bkc8cj1xst4szc','cmnoil1c800w9c8cjukwh951s','cmnojanms0142c8cj5u8o7zo2','cmnold0940183c8cjwxzpfoyc','cmnoitgla0110c8cjp5im17l9','cmnnbvtzr021x11b9t86a1enj','cmnolaitm016zc8cji86gap6q','cmnnbwljt022h11b95uslq6fu','cmnoj9mtb013sc8cjj2f9n1df'];
  const rows = await prisma.orderAuditLog.findMany({
    where: { orderId: { in: ids } },
    select: { orderId: true, action: true, oldValue: true, newValue: true, createdAt: true },
    orderBy: [{ orderId: 'asc' }, { createdAt: 'desc' }]
  });
  const sample = rows.slice(0,80).map(r=>({orderId:r.orderId,action:r.action,oldValue:r.oldValue,newValue:r.newValue,createdAt:r.createdAt}));
  console.log(JSON.stringify(sample,null,2));
})();
