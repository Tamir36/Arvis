// Mongolian localization strings

export const mn = {
  // Navigation
  nav: {
    dashboard: "Хянах самбар",
    products: "Бараа",
    orders: "Захиалга",
    delivery: "Хүргэлт",
    customers: "Харилцагч",
    settings: "Тохиргоо",
    fulfillment: "Биелэлт",
    myDeliveries: "Миний хүргэлт",
    routes: "Маршрут",
    reports: "Тайлан",
  },

  // Common actions
  actions: {
    add: "Нэмэх",
    edit: "Засах",
    delete: "Устгах",
    save: "Хадгалах",
    cancel: "Цуцлах",
    confirm: "Баталгаажуулах",
    search: "Хайх",
    filter: "Шүүх",
    export: "Экспорт",
    import: "Импорт",
    download: "Татах",
    upload: "Оруулах",
    submit: "Илгээх",
    back: "Буцах",
    next: "Дараах",
    previous: "Өмнөх",
    view: "Харах",
    close: "Хаах",
    refresh: "Шинэчлэх",
    print: "Хэвлэх",
    assign: "Хуваарилах",
    approve: "Зөвшөөрөх",
    reject: "Татгалзах",
  },

  // Status labels
  status: {
    // Product status
    ACTIVE: "Идэвхтэй",
    DRAFT: "Идэвхгүй",
    OUT_OF_STOCK: "Дуусгавар",

    // Order status
    BLANK: "Blank",
    PENDING: "Хүлээгдэж байна",
    CONFIRMED: "Баталгаажсан",
    PACKED: "Савласан",
    SHIPPED: "Илгээсэн",
    POSTPONED: "Хойшлуулсан",
    DELIVERED: "Хүргэсэн",
    LATE_DELIVERED: "Орой хүргэсэн",
    CANCELLED: "Цуцлагдсан",
    RETURNED: "Буцаасан",

    // Payment status
    PAID: "Төлсөн",
    UNPAID: "Төлөөгүй",
    PARTIAL: "Хэсэгчлэн",
    REFUNDED: "Буцаан олгосон",

    // Delivery
    ASSIGNED: "Хуваарилсан",
    IN_TRANSIT: "Замд яваа",
    COMPLETED: "Дуусгавар",
  },

  // Roles
  roles: {
    ADMIN: "Админ",
    OPERATOR: "Оператор",
    DRIVER: "Жолооч",
  },

  // Products
  products: {
    title: "Бараа бүтээгдэхүүн",
    name: "Бараaны нэр",
    category: "Ангилал",
    description: "Тайлбар",
    price: "Үнэ",
    stock: "Үлдэгдэл",
    sku: "SKU",
    status: "Статус",
    images: "Зураг",
    variants: "Хувилбар",
    weight: "Жин (кг)",
    tags: "Шошго",
    newProduct: "Шинэ бараа",
    editProduct: "Бараа засах",
    priceHistory: "Үнийн түүх",
    inventory: "Агуулахын мэдээлэл",
    quantity: "Тоо ширхэг",
    minStock: "Доод хэмжээ",
    location: "Байрлал",
    size: "Хэмжээ",
    color: "Өнгө",
  },

  // Orders
  orders: {
    title: "Захиалга",
    orderNumber: "Захиалгын дугаар",
    customer: "Харилцагч",
    date: "Огноо",
    status: "Статус",
    payment: "Төлбөр",
    total: "Нийт дүн",
    items: "Бараа",
    subtotal: "Дэд нийлбэр",
    discount: "Хөнгөлөлт",
    deliveryFee: "Хүргэлтийн төлбөр",
    tax: "НӨАТ",
    coupon: "Купон",
    notes: "Тэмдэглэл",
    shippingAddress: "Хүргэлтийн хаяг",
    newOrder: "Шинэ захиалга",
    auditLog: "Өөрчлөлтийн түүх",
  },

  // Customers
  customers: {
    title: "Харилцагч",
    name: "Нэр",
    email: "Имэйл",
    phone: "Утас",
    address: "Хаяг",
    district: "Дүүрэг",
    city: "Хот",
    totalOrders: "Нийт захиалга",
    totalSpent: "Нийт зарцуулсан",
  },

  // Delivery
  delivery: {
    title: "Хүргэлт",
    zone: "Хүргэлтийн бүс",
    agent: "Жолооч",
    vehicle: "Тээврийн хэрэгсэл",
    timeSlot: "Цагийн цонх",
    tracking: "Трэкинг",
    pickList: "Авах жагсаалт",
    packList: "Савлах жагсаалт",
    assignDriver: "Жолооч хуваарилах",
    zones: "Хүргэлтийн бүс",
    assignments: "Хуваарилалт",
  },

  // Messages
  messages: {
    loading: "Ачааллаж байна...",
    noData: "Мэдээлэл олдсонгүй",
    success: "Амжилттай хадгалагдлаа",
    error: "Алдаа гарлаа",
    deleteConfirm: "Устгахдаа итгэлтэй байна уу?",
    saved: "Амжилттай хадгаллаа",
    updated: "Амжилттай шинэчиллээ",
    deleted: "Амжилттай устгалаа",
    created: "Амжилттай үүсгэлээ",
  },

  // Auth
  auth: {
    login: "Нэвтрэх",
    logout: "Гарах",
    email: "Имэйл хаяг",
    password: "Нууц үг",
    loginButton: "Нэвтрэх",
    invalidCredentials: "Имэйл эсвэл нууц үг буруу байна",
    welcome: "Тавтай морил",
  },

  // Dashboard stats
  stats: {
    totalRevenue: "Нийт орлого",
    totalOrders: "Нийт захиалга",
    activeProducts: "Идэвхтэй бараа",
    totalCustomers: "Харилцагч",
    todayOrders: "Өнөөдрийн захиалга",
    pendingOrders: "Хүлээгдэж буй",
    lowStock: "Дуусч байгаа",
  },
} as const;

export type TranslationKey = typeof mn;
