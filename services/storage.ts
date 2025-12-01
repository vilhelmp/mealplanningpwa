import { Recipe, MealPlanItem, ShoppingItem, AppSettings, Store } from '../types';
import { MOCK_RECIPES, INITIAL_SETTINGS, generateInitialPlan, mergeShoppingList } from './mockData';

const DB_NAME = 'homechef-db';
const DB_VERSION = 1;

const STORES = {
  RECIPES: 'recipes',
  PLAN: 'plan',
  SHOPPING: 'shopping',
  SETTINGS: 'settings'
};

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORES.RECIPES)) {
        db.createObjectStore(STORES.RECIPES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PLAN)) {
        db.createObjectStore(STORES.PLAN, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SHOPPING)) {
        db.createObjectStore(STORES.SHOPPING, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
};

// Generic Transaction Helper
const performTransaction = <T>(
  storeName: string, 
  mode: IDBTransactionMode, 
  callback: (store: IDBObjectStore) => IDBRequest | void
): Promise<T> => {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      
      let request: IDBRequest | void;
      try {
        request = callback(store);
      } catch (e) {
        reject(e);
        return;
      }

      transaction.oncomplete = () => {
        resolve((request as IDBRequest)?.result as T);
      };
      
      transaction.onerror = () => reject(transaction.error);
    });
  });
};

const getAll = <T>(storeName: string): Promise<T[]> => {
    return performTransaction<T[]>(storeName, 'readonly', store => store.getAll());
};

const put = (storeName: string, item: any): Promise<void> => {
    return performTransaction(storeName, 'readwrite', store => store.put(item));
};

const remove = (storeName: string, id: number): Promise<void> => {
    return performTransaction(storeName, 'readwrite', store => store.delete(id));
};

const clear = (storeName: string): Promise<void> => {
    return performTransaction(storeName, 'readwrite', store => store.clear());
};

// Service API
export const storage = {
    // Initialization & Seeding
    async init(): Promise<boolean> {
        try {
            const recipes = await getAll<Recipe>(STORES.RECIPES);
            if (recipes.length === 0) {
                console.log("Seeding Database...");
                // Seed Recipes
                for (const r of MOCK_RECIPES) await put(STORES.RECIPES, r);
                
                // Seed Plan
                const plan = generateInitialPlan(MOCK_RECIPES);
                for (const p of plan) await put(STORES.PLAN, p);

                // Seed Settings
                await put(STORES.SETTINGS, { id: 'config', ...INITIAL_SETTINGS });

                // Seed Shopping List (Derived)
                const list = mergeShoppingList([], plan, MOCK_RECIPES, INITIAL_SETTINGS.pantry_staples);
                for (const item of list) await put(STORES.SHOPPING, item);
                
                return true;
            }
            return false;
        } catch (e) {
            console.error("DB Init Failed", e);
            return false;
        }
    },

    // Recipes
    getRecipes: () => getAll<Recipe>(STORES.RECIPES),
    saveRecipe: (recipe: Recipe) => put(STORES.RECIPES, recipe),
    deleteRecipe: (id: number) => remove(STORES.RECIPES, id),

    // Plan
    getPlan: () => getAll<MealPlanItem>(STORES.PLAN),
    savePlanItem: (item: MealPlanItem) => put(STORES.PLAN, item),
    deletePlanItem: (id: number) => remove(STORES.PLAN, id),
    clearPlan: () => clear(STORES.PLAN),

    // Shopping
    getShoppingList: () => getAll<ShoppingItem>(STORES.SHOPPING),
    saveShoppingItem: (item: ShoppingItem) => put(STORES.SHOPPING, item),
    deleteShoppingItem: (id: number) => remove(STORES.SHOPPING, id),
    saveShoppingList: async (items: ShoppingItem[]) => {
        // Bulk replace logic: Clear then Add all
        // Note: In a real app, meaningful diffing is better, but this ensures sync
        await clear(STORES.SHOPPING);
        const db = await openDB();
        const tx = db.transaction(STORES.SHOPPING, 'readwrite');
        const store = tx.objectStore(STORES.SHOPPING);
        items.forEach(item => store.put(item));
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    // Settings
    getSettings: async (): Promise<AppSettings> => {
        const result = await performTransaction<any>(STORES.SETTINGS, 'readonly', store => store.get('config'));
        return result || INITIAL_SETTINGS;
    },
    saveSettings: (settings: AppSettings) => put(STORES.SETTINGS, { id: 'config', ...settings }),
};
