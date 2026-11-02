// Grocery text helpers: quantities, store aisles and "often bought" keys.

export const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Often bought" keys: lower-case, tidy, short
export const oftenKey = (text) => text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);

// "2 milk", "milk x2", "3× eggs" → quantity + name. "2 kg rice" keeps its unit.
const LEADING_QTY = /^(\d{1,3})\s*[x×]?\s+(?!(?:kg|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|lb|lbs|oz|dozen|packs?|pcs|pieces?|bunch|bunches|bottles?|cans?|box|boxes|bags?|loaf|loaves)\b)(\S.*)$/i;
const TRAILING_QTY = /^(\S.*?)\s*[x×]\s*(\d{1,3})$/i;

export function parseQty(raw) {
  const text = raw.trim();
  let m = text.match(LEADING_QTY);
  if (m) return { text: m[2].trim(), qty: Math.max(1, Number(m[1])) };
  m = text.match(TRAILING_QTY);
  if (m) return { text: m[1].trim(), qty: Math.max(1, Number(m[2])) };
  return { text, qty: 1 };
}

// Aisles in the order you'd walk a typical shop. First match wins, so specific
// words (chilli powder) are checked before broad ones (chilli).
const AISLE_RULES = [
  ["Spices & masala", /\b(masala|turmeric|haldi|jeera|cumin|mustard seed|spice|cardamom|elaichi|clove|cinnamon|hing|powder|garam|saffron|oregano|bay lea)/],
  ["Dairy & eggs", /\b(milk|curd|yog|dahi|paneer|butter|ghee|cheese|cream|eggs?\b|buttermilk|lassi)/],
  ["Bakery", /\b(bread|buns?\b|pav|cake|croissant|bagel|tortilla|roti|naan|muffin)/],
  ["Meat & fish", /\b(chicken|mutton|fish|prawn|shrimp|meat|beef|pork|lamb|salmon|tuna|sausage|bacon)/],
  ["Grains & staples", /\b(rice|atta|flour|maida|dal|lentil|chana|rajma|oats|poha|rava|suji|sugar|salt|jaggery|oil|pasta|noodle|cereal|besan|quinoa|sooji|vermicelli)/],
  ["Fruit & veg", /\b(apple|banana|mango|orange|grape|lemon|lime|onion|tomato|potato|garlic|ginger|chil+i|coriander|cilantro|mint|spinach|palak|methi|carrot|cucumber|capsicum|pepper|beans|peas|cabbage|cauliflower|brinjal|eggplant|okra|bhindi|lettuce|avocado|berr|fruit|veg|curry lea|pumpkin|gourd|beet|radish|mushroom|corn|papaya|melon|pomegranate|guava|kiwi|pear|broccoli|zucchini|celery|herb)/],
  ["Snacks & drinks", /\b(chips|snack|namkeen|chocolate|juice|soda|coke|tea|coffee|water|beer|wine|ice ?cream|nuts?\b|almond|cashew|biscuit|cookie|crackers?|popcorn)/],
  ["Household", /\b(soap|detergent|shampoo|toothpaste|toothbrush|tissue|paper|cleaner|dish|bin bags?|garbage|sponge|diaper|wipes|batter(y|ies)|bulb|foil|cling|handwash|sanitizer|conditioner|lotion|razor)/],
];
export const AISLES = [
  "Fruit & veg", "Bakery", "Dairy & eggs", "Meat & fish", "Grains & staples",
  "Spices & masala", "Snacks & drinks", "Household", "Other",
];
export const aisleOf = (text) => AISLE_RULES.find(([, re]) => re.test(text.toLowerCase()))?.[0] ?? "Other";
