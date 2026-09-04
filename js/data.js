const RESTAURANT = {
  name: "Meerath Kabab",
  nameAr: "ميراث كباب",
  phoneDisplay: "0561663119",
  phone: "+966561663119",
  whatsapp: "966561663119",
  address: "Olaya Street, Riyadh, Saudi Arabia",
  addressAr: "شارع العليا، الرياض، المملكة العربية السعودية",
  maps: "https://maps.app.goo.gl/wQeq8SabZ1GfgKUN7",
};

const CATEGORIES = [
  {
    id: "biryani",
    name: "Biryani",
    nameAr: "برياني",
    image:
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80",
  },
  {
    id: "bbq",
    name: "BBQ",
    nameAr: "مشويات",
    image:
      "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=400&q=80",
  },
  {
    id: "karahi",
    name: "Karahi",
    nameAr: "كراهي",
    image:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400&q=80",
  },
  {
    id: "handi",
    name: "Handi",
    nameAr: "هاندي",
    image:
      "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80",
  },
  {
    id: "rolls",
    name: "Rolls",
    nameAr: "رولز",
    image:
      "https://6a89aee297833836f655edcd.imgix.net/sandbox/Rolls.jpg",
  },
  {
    id: "broast",
    name: "Broast",
    nameAr: "بروست",
    image:
      "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=400&q=80",
  },
  {
    id: "chinese",
    name: "Chinese",
    nameAr: "صيني",
    image:
      "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&q=80",
  },
  {
    id: "drinks",
    name: "Drinks",
    nameAr: "مشروبات",
    image:
      "https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=400&q=80",
  },
  {
    id: "desserts",
    name: "Desserts",
    nameAr: "حلويات",
    image:
      "https://images.unsplash.com/photo-1666190092159-3171cf0fbb12?w=400&q=80",
  },
  {
    id: "deals",
    name: "Deals",
    nameAr: "عروض",
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80",
  },
];

const ITEMS = [
  {
    id: "chicken-biryani",
    category: "biryani",
    name: "Chicken Biryani",
    nameAr: "برياني دجاج",
    desc: "Fragrant basmati rice with tender chicken, whole spices, and fried onions.",
    descAr: "أرز بسمتي مع دجاج طري وتوابل كاملة وبصل مقلي.",
    price: 28,
    rating: 4.6,
    bestSeller: true,
    special: true,
    image:
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
  },
  {
    id: "mutton-biryani",
    category: "biryani",
    name: "Mutton Biryani",
    nameAr: "برياني لحم",
    desc: "Slow-cooked mutton layered with saffron rice.",
    descAr: "لحم مطهو ببطء مع أرز الزعفران.",
    price: 38,
    rating: 4.8,
    bestSeller: true,
    image:
      "https://images.unsplash.com/photo-1701579231305-d84d8af9a3fd?w=800&q=80",
  },
  {
    id: "veg-biryani",
    category: "biryani",
    name: "Vegetable Biryani",
    nameAr: "برياني خضار",
    desc: "Garden vegetables, mint, and aromatic rice.",
    descAr: "خضار طازجة ونعناع وأرز معطر.",
    price: 22,
    rating: 4.3,
    image:
      "https://images.unsplash.com/photo-1599043513900-ed6fe6d4cdbf?w=800&q=80",
  },
  {
    id: "seekh-kabab",
    category: "bbq",
    name: "Seekh Kabab",
    nameAr: "سيخ كباب",
    desc: "Charcoal-grilled minced beef kababs, 4 pieces.",
    descAr: "كباب لحم مشوي على الفحم، 4 قطع.",
    price: 32,
    rating: 4.7,
    special: true,
    image:
      "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=800&q=80",
  },
  {
    id: "chicken-tikka",
    category: "bbq",
    name: "Chicken Tikka",
    nameAr: "تكة دجاج",
    desc: "Yogurt-marinated chicken, smoky tandoor finish.",
    descAr: "دجاج متبل بالزبادي مع لمسة تنور مدخنة.",
    price: 30,
    rating: 4.5,
    bestSeller: true,
    image:
      "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80",
  },
  {
    id: "malai-boti",
    category: "bbq",
    name: "Malai Boti",
    nameAr: "ملائي بوتي",
    desc: "Creamy white chicken boti, mild and rich.",
    descAr: "بوتي دجاج كريمي خفيف وغني.",
    price: 34,
    rating: 4.4,
    image:
      "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=800&q=80",
  },
  {
    id: "chicken-karahi",
    category: "karahi",
    name: "Chicken Karahi",
    nameAr: "كراهي دجاج",
    desc: "Tomato-ginger karahi, served with naan.",
    descAr: "كراهي بالطماطم والزنجبيل مع نان.",
    price: 42,
    rating: 4.6,
    special: true,
    image:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
  },
  {
    id: "mutton-karahi",
    category: "karahi",
    name: "Mutton Karahi",
    nameAr: "كراهي لحم",
    desc: "Traditional mutton karahi with green chilies.",
    descAr: "كراهي لحم تقليدي مع فلفل أخضر.",
    price: 55,
    rating: 4.7,
    image:
      "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
  },
  {
    id: "chicken-handi",
    category: "handi",
    name: "Chicken Handi",
    nameAr: "هاندي دجاج",
    desc: "Creamy handi with cashew gravy.",
    descAr: "هاندي كريمي بصلصة الكاجو.",
    price: 40,
    rating: 4.5,
    image:
      "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80",
  },
  {
    id: "chicken-roll",
    category: "rolls",
    name: "Chicken Tikka Roll",
    nameAr: "رول تكة دجاج",
    desc: "Soft paratha wrapped around tikka and chutney.",
    descAr: "باراثا طري مع التكة والثاتني.",
    price: 16,
    rating: 4.4,
    image:
      "https://images.unsplash.com/photo-1626700051175-64363705b21b?w=800&q=80",
  },
  {
    id: "broast-quarter",
    category: "broast",
    name: "Broast Quarter",
    nameAr: "ربع بروست",
    desc: "Crispy Pakistani-style broast with fries.",
    descAr: "بروست باكستاني مقرمش مع بطاطس.",
    price: 24,
    rating: 4.2,
    image:
      "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=800&q=80",
  },
  {
    id: "chicken-manchurian",
    category: "chinese",
    name: "Chicken Manchurian",
    nameAr: "دجاج منشوري",
    desc: "Indo-Chinese classic with steamed rice.",
    descAr: "طبق صيني-هندي كلاسيكي مع أرز.",
    price: 26,
    rating: 4.1,
    image:
      "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=80",
  },
  {
    id: "mango-lassi",
    category: "drinks",
    name: "Mango Lassi",
    nameAr: "لاسي مانجو",
    desc: "Sweet yogurt drink with ripe mango.",
    descAr: "مشروب زبادي حلو بالمانجو.",
    price: 10,
    rating: 4.6,
    image:
      "https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=800&q=80",
  },
  {
    id: "fresh-lime",
    category: "drinks",
    name: "Fresh Lime",
    nameAr: "ليمون طازج",
    desc: "Soda or still, with mint.",
    descAr: "بالصودا أو الماء مع النعناع.",
    price: 8,
    rating: 4.3,
    image:
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
  },
  {
    id: "kheer",
    category: "desserts",
    name: "Kheer",
    nameAr: "خير",
    desc: "Cardamom rice pudding, pistachio garnish.",
    descAr: "مهلبية أرز بالهيل والفستق.",
    price: 12,
    rating: 4.5,
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80",
  },
  {
    id: "gulab-jamun",
    category: "desserts",
    name: "Gulab Jamun",
    nameAr: "غولاب جامون",
    desc: "Warm milk dumplings in rose syrup. 2 pieces.",
    descAr: "كرات حليب دافئة بشيرة الورد. قطعتان.",
    price: 10,
    rating: 4.7,
    image:
      "https://images.unsplash.com/photo-1666190092159-3171cf0fbb12?w=800&q=80",
  },
  {
    id: "lunch-deal",
    category: "deals",
    name: "Lunch Deal",
    nameAr: "عرض الغداء",
    desc: "Chicken biryani + drink. Available 12–4 PM.",
    descAr: "برياني دجاج + مشروب. من 12 إلى 4 عصراً.",
    price: 32,
    rating: 4.4,
    offer: true,
    image:
      "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
  },
  {
    id: "family-bbq",
    category: "deals",
    name: "Family BBQ Platter",
    nameAr: "طبق مشاوي عائلي",
    desc: "Mixed grill for 4, naan, and raita.",
    descAr: "مشاوي مشكلة لـ 4 أشخاص مع نان ورايتا.",
    price: 149,
    rating: 4.8,
    offer: true,
    special: true,
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
  },
  {
    id: "weekend-karahi",
    category: "deals",
    name: "Weekend Karahi Offer",
    nameAr: "عرض كراهي نهاية الأسبوع",
    desc: "Chicken karahi + 4 naan + 2 drinks.",
    descAr: "كراهي دجاج + 4 نان + مشروبان.",
    price: 79,
    rating: 4.5,
    offer: true,
    image:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
  },
];

const OFFERS = [
  {
    id: "o1",
    title: "Lunch Deal",
    titleAr: "عرض الغداء",
    subtitle: "Biryani + drink · 12–4 PM",
    subtitleAr: "برياني + مشروب · 12–4 عصراً",
    price: 32,
    itemId: "lunch-deal",
    tab: "deals",
  },
  {
    id: "o2",
    title: "Family BBQ Platter",
    titleAr: "طبق مشاوي عائلي",
    subtitle: "Grill for 4 people",
    subtitleAr: "مشاوي لـ 4 أشخاص",
    price: 149,
    itemId: "family-bbq",
    tab: "deals",
  },
  {
    id: "o3",
    title: "Weekend Karahi Offer",
    titleAr: "عرض كراهي نهاية الأسبوع",
    subtitle: "Karahi + naan + drinks",
    subtitleAr: "كراهي + نان + مشروبات",
    price: 79,
    itemId: "weekend-karahi",
    tab: "deals",
  },
  {
    id: "o4",
    title: "Free Dessert",
    titleAr: "حلوى مجانية",
    subtitle: "On orders above SAR 80",
    subtitleAr: "على الطلبات فوق 80 ر.س",
    price: null,
    itemId: "gulab-jamun",
    tab: "all",
  },
];

const VOUCHERS = [
  { id: "v1", title: "SAR 10 off", titleAr: "خصم 10 ر.س", cost: 100 },
  { id: "v2", title: "Free drink", titleAr: "مشروب مجاني", cost: 60 },
  { id: "v3", title: "SAR 25 off", titleAr: "خصم 25 ر.س", cost: 200 },
];

const EXTRAS = [
  { id: "raita", name: "Extra Raita", nameAr: "رايتا إضافي", price: 4 },
  { id: "salad", name: "Extra Salad", nameAr: "سلطة إضافية", price: 5 },
  { id: "drink", name: "Soft Drink", nameAr: "مشروب غازي", price: 6 },
];
