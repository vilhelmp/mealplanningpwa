import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ShoppingItem, Language, AppSettings, SHOPPING_CATEGORIES, MealPlanItem, Recipe } from '../types';
import { Card, Button, Icons, Input, Modal } from './Shared';
import { mergeShoppingList } from '../services/mockData';
import { CATEGORY_TRANSLATIONS } from '../services/translations';

interface ShopViewProps {
  items: ShoppingItem[]; // Global persisted items (manual + aggregated)
  plan: MealPlanItem[];
  recipes: Recipe[];
  settings: AppSettings;
  onToggleItem: (item: ShoppingItem) => void;
  onAddItem: (name: string) => void;
  onUpdateCategory: (id: number, category: string) => void;
  onUpdateItem: (id: number, updates: Partial<ShoppingItem>) => void;
  onClearChecked: () => void;
  language: string;
  t: any;
}

const UNITS = [
    'pc', 'st', 'pkt', 'g', 'kg', 'ml', 'cl', 'dl', 'l', 'tsp', 'tbsp', 'cup', 'can', 'jar', 'bunch', 'pinch'
];

export const ShopView: React.FC<ShopViewProps> = ({ items, plan, recipes, settings, onToggleItem, onAddItem, onUpdateCategory, onUpdateItem, onClearChecked, language, t }) => {
  const [newItemName, setNewItemName] = useState('');
  
  // Accordion state: only one item expanded at a time
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  
  // Edit mode state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState(0);
  const [editUnit, setEditUnit] = useState('pc');

  // Long press state
  const [movingItem, setMovingItem] = useState<ShoppingItem | null>(null);
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);
  
  // Store Selection State
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  // Week Selection State (0 = This week, 1 = Next week)
  const [weekOffset, setWeekOffset] = useState(0);

  // --- Dynamic Filtering Logic ---
  
  // 1. Calculate the visible shopping list based on the selected week
  // We use the `items` prop (which contains checking status and manual items) as the base.
  // We re-calculate the recipe ingredients based on the filtered plan to show only relevant items.
  const visibleItems = useMemo(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Determine date range for the selected week
      const startOffset = weekOffset * 7;
      const endOffset = startOffset + 7;
      
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + startOffset);
      
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + endOffset);

      // Filter plan items within range
      const visiblePlan = plan.filter(p => {
          const d = new Date(p.date);
          d.setHours(0, 0, 0, 0);
          return d >= startDate && d < endDate;
      });

      return mergeShoppingList(items, visiblePlan, recipes, settings.pantry_staples);

  }, [items, plan, recipes, settings.pantry_staples, weekOffset]);


  // Extract unique item names for suggestions
  const suggestions = Array.from(new Set(visibleItems.map(i => i.item_name))).sort();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim()) {
      onAddItem(newItemName.trim());
      setNewItemName('');
    }
  };

  const handlePointerDown = (item: ShoppingItem) => {
      // Don't trigger long press if editing or interacting with controls
      if (editingItemId === item.id) return;
      
      isLongPress.current = false;
      timerRef.current = setTimeout(() => {
          isLongPress.current = true;
          setMovingItem(item);
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500);
  };

  const handlePointerUp = () => {
      if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
      }
  };

  const handleCategorySelect = (category: string) => {
      if (movingItem) {
          onUpdateCategory(movingItem.id, category);
          setMovingItem(null);
      }
  };

  const startEditing = (item: ShoppingItem) => {
      setEditingItemId(item.id);
      setEditName(item.item_name);
      setEditQuantity(item.quantity);
      setEditUnit(item.unit || 'pc');
  };

  const saveEdit = (id: number) => {
      if (editName.trim()) {
          onUpdateItem(id, { 
              item_name: editName.trim(), 
              quantity: editQuantity,
              unit: editUnit
          });
      }
      setEditingItemId(null);
      setExpandedItemId(null);
  };

  const toggleExpand = (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setExpandedItemId(prev => prev === id ? null : id);
      setEditingItemId(null); // Cancel edit mode if switching items
  };

  // Determine category order based on selected store
  const activeStore = settings.stores.find(s => s.id === selectedStoreId);
  
  // If a store is selected, use its order. Append any missing categories at the end.
  const displayCategories = activeStore 
    ? [
        ...activeStore.category_order, 
        ...SHOPPING_CATEGORIES.filter(c => !activeStore.category_order.includes(c))
      ]
    : SHOPPING_CATEGORIES;

  // Filter out empty categories for rendering, but maintain order
  const activeCategories = displayCategories.filter(cat => 
      visibleItems.some(i => i.category === cat)
  );

  const getCategoryLabel = (cat: string) => {
      if (CATEGORY_TRANSLATIONS[language]) {
          return CATEGORY_TRANSLATIONS[language][cat] || cat;
      }
      return cat;
  }

  const renderCategory = (cat: string) => {
    // Sort items alphabetically within the category
    const catItems = visibleItems
        .filter(i => i.category === cat)
        .sort((a, b) => a.item_name.localeCompare(b.item_name));
    
    if (catItems.length === 0) return null;

    return (
      <div key={cat} className="mb-3 break-inside-avoid">
        <h3 className="text-[10px] font-bold text-nordic-muted uppercase tracking-wider mb-1 px-1">{getCategoryLabel(cat)}</h3>
        <Card className="divide-y divide-gray-100">
          {catItems.map(item => {
            const isExpanded = expandedItemId === item.id;
            const isEditing = editingItemId === item.id;

            return (
                <div 
                    key={item.id}
                    className={`transition-colors duration-200 ${item.checked ? 'bg-gray-50/50' : 'bg-white'}`}
                >
                    {isEditing ? (
                        <div className="p-3 bg-white border-b border-gray-100 space-y-3 cursor-default" onClick={(e) => e.stopPropagation()}>
                             {/* Row 1: Name */}
                             <div>
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">{t.itemName}</label>
                                <Input 
                                    value={editName}
                                    onChange={(e: any) => setEditName(e.target.value)}
                                    className="w-full !py-2 !px-3 text-sm bg-gray-50"
                                    autoFocus
                                />
                             </div>
                             
                             {/* Row 2: Quantity & Unit */}
                             <div className="flex gap-3">
                                 <div className="flex-1">
                                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">{t.quantity}</label>
                                    <Input 
                                        type="number"
                                        value={editQuantity}
                                        onChange={(e: any) => setEditQuantity(Number(e.target.value))}
                                        className="w-full !py-2 !px-3 text-sm bg-gray-50"
                                    />
                                 </div>
                                 <div className="flex-1">
                                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">{t.unit}</label>
                                    <div className="relative">
                                        <select
                                            value={editUnit}
                                            onChange={(e) => setEditUnit(e.target.value)}
                                            className="w-full py-2.5 px-3 bg-gray-50 border-gray-200 border rounded-xl text-sm outline-none focus:border-nordic-primary appearance-none"
                                        >
                                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                            <Icons.ChevronDown className="w-3 h-3" />
                                        </div>
                                    </div>
                                 </div>
                             </div>

                             {/* Row 3: Actions */}
                             <div className="flex gap-3 pt-1">
                                 <Button onClick={() => saveEdit(item.id)} className="flex-1 h-10 text-sm">
                                     <Icons.Check className="w-4 h-4" /> {t.save}
                                 </Button>
                                 <Button variant="secondary" onClick={() => setEditingItemId(null)} className="flex-1 h-10 text-sm">
                                     {t.cancel}
                                 </Button>
                             </div>
                         </div>
                    ) : (
                        <div 
                            onPointerDown={() => handlePointerDown(item)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onClick={() => {
                                if (!isLongPress.current) {
                                    onToggleItem(item);
                                }
                            }}
                            onContextMenu={(e: any) => e.preventDefault()}
                            className="p-2.5 flex items-center justify-between cursor-pointer group touch-pan-y select-none"
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${item.checked ? 'bg-nordic-primary border-nordic-primary' : 'border-gray-300'}`}>
                                    {item.checked && <Icons.Check className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <div className={`truncate ${item.checked ? 'text-gray-400 line-through' : 'text-nordic-text'}`}>
                                    <span className="font-medium text-sm">{item.item_name}</span>
                                    {(item.quantity > 0) && (
                                        <span className="text-xs text-gray-400 ml-1.5">
                                            {parseFloat(item.quantity.toFixed(2))} {item.unit}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button 
                                onClick={(e) => toggleExpand(e, item.id)}
                                className={`p-1.5 rounded-full transition-colors shrink-0 ${isExpanded ? 'bg-nordic-primary text-white' : 'text-gray-400 hover:text-nordic-primary hover:bg-gray-50'}`}
                            >
                                <Icons.Tool className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Expanded Controls */}
                    {isExpanded && !isEditing && (
                        <div className="px-3 pb-3 flex items-center justify-between bg-gray-50/50 border-t border-gray-100/50 pt-2 animate-in slide-in-from-top-2 duration-200">
                             <div className="flex items-center gap-1">
                                 <button 
                                    onClick={() => onUpdateItem(item.id, { quantity: Math.max(0, item.quantity - 1) })}
                                    className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-nordic-primary hover:border-nordic-primary transition-colors"
                                 >
                                     <Icons.Minus className="w-3.5 h-3.5" />
                                 </button>
                                 <span className="w-10 text-center text-xs font-bold text-gray-700">{parseFloat(item.quantity.toFixed(2))}</span>
                                 <button 
                                    onClick={() => onUpdateItem(item.id, { quantity: item.quantity + 1 })}
                                    className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-nordic-primary hover:border-nordic-primary transition-colors"
                                 >
                                     <Icons.Plus className="w-3.5 h-3.5" />
                                 </button>
                             </div>

                             <div className="flex items-center gap-2">
                                 <button 
                                    onClick={() => startEditing(item)}
                                    className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-nordic-primary hover:border-nordic-primary transition-colors"
                                 >
                                     <Icons.Edit className="w-3.5 h-3.5" />
                                 </button>
                                 <button 
                                    onClick={() => onUpdateItem(item.id, { quantity: 0 })}
                                    className="p-1.5 bg-red-50 border border-red-100 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors"
                                 >
                                     <Icons.Trash className="w-3.5 h-3.5" />
                                 </button>
                             </div>
                        </div>
                    )}
                </div>
            );
          })}
        </Card>
      </div>
    );
  };

  return (
    <div className="pb-24 md:pb-4 space-y-3">
       <div className="flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold text-nordic-text">{t.shop_title}</h1>
          <p className="text-nordic-muted text-xs">{visibleItems.filter(i => !i.checked).length} {t.remaining}</p>
        </div>
        <Button variant="ghost" onClick={onClearChecked} className="text-xs !p-2 h-8">
           {t.clear}
        </Button>
      </div>

      {/* Week Selector */}
      <div className="flex bg-gray-100 p-1 rounded-xl">
           <button 
              onClick={() => setWeekOffset(0)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${weekOffset === 0 ? 'bg-white shadow-sm text-nordic-primary' : 'text-gray-500'}`}
           >
               {t.thisWeek}
           </button>
           <button 
              onClick={() => setWeekOffset(1)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${weekOffset === 1 ? 'bg-white shadow-sm text-nordic-primary' : 'text-gray-500'}`}
           >
               {t.shop_nextWeek}
           </button>
      </div>
      
      {/* Store Selector (if stores exist) */}
      {settings.stores.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <button 
                  onClick={() => setSelectedStoreId(null)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedStoreId === null ? 'bg-nordic-primary text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                  {t.allStores}
              </button>
              {settings.stores.map(store => (
                  <button 
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedStoreId === store.id ? 'bg-nordic-primary text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600'}`}
                  >
                      {store.name}
                  </button>
              ))}
          </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <Input 
          placeholder={t.shop_placeholder}
          value={newItemName}
          onChange={(e: any) => setNewItemName(e.target.value)}
          className="shadow-sm !py-2.5 text-sm"
          list="item-suggestions"
        />
        <datalist id="item-suggestions">
            {suggestions.map((item, index) => (
                <option key={index} value={item} />
            ))}
        </datalist>
        <Button type="submit" variant="primary" disabled={!newItemName} className="aspect-square !px-0 w-11">
          <Icons.Plus className="w-5 h-5" />
        </Button>
      </form>

      <div className="space-y-1 md:columns-2 lg:columns-3 md:gap-4 md:space-y-3">
        {activeCategories.map(cat => renderCategory(cat))}
      </div>
      
      {visibleItems.length === 0 && (
          <div className="text-center py-20 text-gray-400 text-sm">
              {t.shop_empty}
          </div>
      )}

      {/* Move Category Modal */}
      <Modal 
        isOpen={!!movingItem} 
        onClose={() => setMovingItem(null)} 
        title={t.moveTitle}
      >
        <div className="space-y-4">
            <p className="text-sm text-gray-500">
                {t.selectCategory} <span className="font-bold text-nordic-text">{movingItem?.item_name}</span>:
            </p>
            <div className="grid grid-cols-2 gap-2">
                {SHOPPING_CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => handleCategorySelect(cat)}
                        className={`p-2.5 rounded-xl text-xs font-medium transition-colors ${
                            movingItem?.category === cat 
                            ? 'bg-nordic-primary text-white shadow-md' 
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        {getCategoryLabel(cat)}
                    </button>
                ))}
            </div>
        </div>
      </Modal>
    </div>
  );
};