import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MealPlanItem, Recipe, Language, AppSettings } from '../types';
import { Card, Button, Icons, Modal, Input } from './Shared';

interface PlanViewProps {
  plan: MealPlanItem[];
  recipes: Recipe[];
  onGenerate: (viewStart: string) => void;
  onRateMeal: (id: number, rating: number, comment?: string) => void;
  onAddMeal: (date: string, recipeId: number) => void;
  onMoveMeal: (date: string, direction: 'up' | 'down') => void;
  onReorderMeal: (mealId: number, newDate: string) => void;
  onRemoveMeal: (date: string) => void;
  onSelectRecipe: (recipe: Recipe, meal?: MealPlanItem) => void;
  onUndo: () => void;
  canUndo: boolean;
  t: any; // Translation dictionary
  language: string;
  settings?: AppSettings;
}

interface DragState {
    isDragging: boolean;
    itemId: number;
    initialX: number;
    initialY: number;
    currentX: number;
    currentY: number;
    offsetX: number; // Offset within the card
    offsetY: number;
    width: number;
    height: number;
    originalDate: string;
    draggedRecipe?: Recipe;
    draggedMeal?: MealPlanItem;
}

// Helper to format date as YYYY-MM-DD using local time
const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const PlanView: React.FC<PlanViewProps> = ({ plan, recipes, onGenerate, onRateMeal, onAddMeal, onMoveMeal, onReorderMeal, onRemoveMeal, onSelectRecipe, onUndo, canUndo, t, language, settings }) => {
  const [ratingItem, setRatingItem] = useState<MealPlanItem | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  
  const [addingToDate, setAddingToDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Helper to calculate the start of the week relative to a date (Local Time)
  const getStartOfWeek = (date: Date, startDay: number = 1) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0); // Normalize to local midnight first
      const day = d.getDay(); // 0 (Sun) to 6 (Sat)
      
      const diff = (day < startDay ? 7 : 0) + day - startDay;
      d.setDate(d.getDate() - diff);
      return d;
  };

  const weekStartDay = settings?.week_start_day ?? 1; // Default Monday

  // Navigation State - Initialize to the start of the CURRENT week
  const [viewStartDate, setViewStartDate] = useState(() => getStartOfWeek(new Date(), weekStartDay));

  // Reset view if setting changes
  useEffect(() => {
     setViewStartDate(getStartOfWeek(new Date(), weekStartDay));
  }, [weekStartDay]);

  // Drag State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const longPressTimer = useRef<any>(null);

  // Helper to check if a date is in the past (strict day comparison)
  const isDatePast = (dateStr: string) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Parse local YYYY-MM-DD
      const [y, m, d] = dateStr.split('-').map(Number);
      const target = new Date(y, m - 1, d);
      
      return target < today;
  };

  // Generate 7 days based on viewStartDate using Local Time formatting
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(viewStartDate);
    d.setDate(viewStartDate.getDate() + i);
    return formatLocalDate(d);
  });

  const changeWeek = (offset: number) => {
      const newDate = new Date(viewStartDate);
      newDate.setDate(newDate.getDate() + (offset * 7));
      setViewStartDate(newDate);
  };

  const resetToCurrent = () => {
      setViewStartDate(getStartOfWeek(new Date(), weekStartDay));
  };

  const handleSaveRating = () => {
      if (ratingItem) {
          onRateMeal(ratingItem.id, ratingValue, ratingComment);
          setRatingItem(null);
          setRatingValue(0);
          setRatingComment('');
      }
  };

  // Drag Event Handlers
  const handlePointerDown = (e: React.PointerEvent, meal: MealPlanItem, recipe: Recipe, date: string) => {
      if (isDatePast(date)) return; // Disable dragging for past items
      
      // Ignore if clicking internal buttons
      if ((e.target as HTMLElement).closest('button')) return;

      const element = e.currentTarget as HTMLElement;
      const rect = element.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      const offsetX = x - rect.left;
      const offsetY = y - rect.top;

      longPressTimer.current = setTimeout(() => {
          setDragState({
              isDragging: true,
              itemId: meal.id,
              initialX: x,
              initialY: y,
              currentX: x,
              currentY: y,
              offsetX,
              offsetY,
              width: rect.width,
              height: rect.height,
              originalDate: date,
              draggedRecipe: recipe,
              draggedMeal: meal
          });
          if (navigator.vibrate) navigator.vibrate(50);
          
          // Disable body scroll on touch devices while dragging
          document.body.style.overflow = 'hidden';
      }, 500);
  };

  const cancelLongPress = () => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
  };

  // Global listeners for dragging
  useEffect(() => {
      if (!dragState?.isDragging) return;

      const handleMove = (e: PointerEvent) => {
          e.preventDefault(); // Prevent scrolling
          setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
          
          // Hit testing
          const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
          const dayContainer = elementUnder?.closest('[data-plan-date]');
          if (dayContainer) {
              const date = dayContainer.getAttribute('data-plan-date');
              // Prevent dropping on past dates
              if (date && !isDatePast(date)) {
                  setHoveredDate(date);
              } else {
                  setHoveredDate(null);
              }
          } else {
              setHoveredDate(null);
          }
      };

      const handleUp = (e: PointerEvent) => {
          if (hoveredDate && hoveredDate !== dragState.originalDate) {
              onReorderMeal(dragState.itemId, hoveredDate);
          }
          
          setDragState(null);
          setHoveredDate(null);
          document.body.style.overflow = '';
      };

      window.addEventListener('pointermove', handleMove, { passive: false });
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);

      return () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
          window.removeEventListener('pointercancel', handleUp);
      };
  }, [dragState?.isDragging, hoveredDate, onReorderMeal]);

  // Filter recipes for search
  const filteredRecipes = recipes.filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()));

  // Check if we are viewing the current week
  const todayStr = formatLocalDate(new Date());
  const isCurrentWeekView = days.includes(todayStr);

  return (
    <div className="pb-24 md:pb-4 space-y-2">
       {/* Title */}
       <div className="px-1 pt-1">
          <h1 className="text-xl font-bold text-nordic-text">{t.plan_title}</h1>
       </div>

       {/* Compact Header with Navigation */}
       <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
            <Button onClick={() => changeWeek(-1)} variant="secondary" className="!p-2 text-xs h-8">
                <Icons.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={resetToCurrent} variant="ghost" className={`!px-2 text-xs h-8 font-bold ${isCurrentWeekView ? 'text-nordic-primary' : 'text-gray-500'}`}>
                {isCurrentWeekView ? t.currentWeek : `${new Date(days[0]).toLocaleDateString(language, { month: 'short', day: 'numeric' })} - ${new Date(days[6]).toLocaleDateString(language, { month: 'short', day: 'numeric' })}`}
            </Button>
            <Button onClick={() => changeWeek(1)} variant="secondary" className="!p-2 text-xs h-8">
                <Icons.ArrowRight className="w-3.5 h-3.5" />
            </Button>
        </div>
        <div className="flex gap-2">
            <Button onClick={onUndo} disabled={!canUndo} variant="secondary" className="!p-2 text-xs h-8">
               <Icons.Undo className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={() => onGenerate(days[0])} variant="secondary" className="!p-2 text-xs h-8">
               <Icons.Sparkles className="w-3.5 h-3.5 text-nordic-accent" /> {t.generate}
            </Button>
        </div>
      </div>

      <div className="space-y-2 select-none md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
        {days.map((date, index) => {
            const meal = plan.find(p => p.date === date);
            const recipe = meal ? recipes.find(r => r.id === meal.recipe_id) : null;
            const isHovered = hoveredDate === date;
            const isBeingDragged = dragState?.originalDate === date;
            const isPast = isDatePast(date);

            // Parse locally for display
            const [y,m,d] = date.split('-').map(Number);
            const dateObj = new Date(y, m-1, d);
            
            const weekday = dateObj.toLocaleDateString(language, { weekday: 'short' }).toUpperCase().replace('.', '');
            const dayNum = dateObj.getDate();
            const isToday = todayStr === date;

            return (
                <div 
                    key={date} 
                    className={`relative rounded-2xl transition-all duration-200 ${isHovered ? 'ring-2 ring-nordic-primary ring-offset-2' : ''} ${isPast ? 'grayscale opacity-75' : ''}`}
                    data-plan-date={date}
                >
                    <div className="flex items-stretch gap-2 md:h-full md:bg-white md:p-2 md:rounded-xl md:border md:border-gray-100 md:shadow-sm">
                        {/* Compact Date Column */}
                        <div className={`flex flex-col items-center justify-center w-12 rounded-xl flex-shrink-0 border transition-all h-16 md:h-full ${isToday ? 'bg-nordic-primary text-white shadow-md border-transparent' : 'bg-white text-gray-400 border-gray-100 md:bg-gray-50'}`}>
                            <span className="text-[9px] font-bold tracking-wider opacity-80">{weekday}</span>
                            <span className="text-lg font-bold leading-none">{dayNum}</span>
                        </div>
                        
                        {/* Meal Card Column */}
                        <div className="flex-grow min-w-0">
                            {meal && recipe ? (
                                <div
                                    onPointerDown={(e) => handlePointerDown(e, meal, recipe, date)}
                                    onPointerMove={cancelLongPress} 
                                    onPointerUp={cancelLongPress}
                                    onPointerLeave={cancelLongPress}
                                    className={`h-full transition-opacity duration-200 ${isBeingDragged ? 'opacity-30' : 'opacity-100'}`}
                                >
                                    <Card 
                                        className="h-full flex flex-col justify-center relative group cursor-pointer active:scale-[0.99] transition-transform shadow-none border-gray-200 hover:border-nordic-primary/50 md:shadow-none md:border-transparent" 
                                        onClick={() => {
                                            if (!dragState) onSelectRecipe(recipe, meal);
                                        }}
                                    >
                                        <div className="flex items-center p-1.5 gap-3">
                                            {/* Compact Image */}
                                            <img src={recipe.images[0]} className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0 pointer-events-none" alt={recipe.title} />
                                            
                                            <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                                                <div className="flex justify-between items-start gap-1">
                                                    <div className="min-w-0">
                                                        <h4 className="font-semibold text-sm text-nordic-text truncate leading-tight mb-0.5">{recipe.title}</h4>
                                                        <p className="text-[10px] text-gray-400">{meal.servings || recipe.servings_default} {t.servings}</p>
                                                    </div>
                                                    
                                                    {/* Controls - Hidden if Past */}
                                                    {!isPast && (
                                                        <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onMoveMeal(date, 'up'); }} 
                                                                className="text-gray-400 hover:text-nordic-primary p-1 rounded-full hover:bg-gray-50 md:hidden"
                                                            >
                                                                <Icons.ChevronUp className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onMoveMeal(date, 'down'); }} 
                                                                className="text-gray-400 hover:text-nordic-primary p-1 rounded-full hover:bg-gray-50 md:hidden"
                                                            >
                                                                <Icons.ChevronDown className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                            onClick={(e) => { e.stopPropagation(); setAddingToDate(date); }} 
                                                            className="text-gray-400 hover:text-nordic-primary p-1 rounded-full hover:bg-gray-50"
                                                            >
                                                            <Icons.Refresh className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                            onClick={(e) => { e.stopPropagation(); onRemoveMeal(date); }} 
                                                            className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50"
                                                            >
                                                            <Icons.Trash className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Bottom Row: Rating / Cooked status */}
                                                <div className="flex items-center gap-2 mt-0.5 pointer-events-auto">
                                                     {meal.is_cooked ? (
                                                         <div className="flex items-center gap-0.5 bg-yellow-50 px-1.5 py-0.5 rounded-md">
                                                             <Icons.Star className="w-3 h-3 text-nordic-accent" fill={true} />
                                                             <span className="text-[10px] font-bold text-yellow-700">{meal.rating || '-'}</span>
                                                             {/* Allow re-rating even if cooked/past */}
                                                             <button 
                                                                onClick={(e) => { e.stopPropagation(); setRatingItem(meal); }}
                                                                className="ml-1 text-[9px] underline text-gray-400 hover:text-nordic-primary"
                                                             >
                                                                 Edit
                                                             </button>
                                                         </div>
                                                     ) : (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setRatingItem(meal); }}
                                                            className="text-[10px] font-medium text-nordic-primary/70 hover:text-nordic-primary"
                                                        >
                                                            {t.rateButton}
                                                        </button>
                                                     )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            ) : (
                                !isPast ? (
                                    <button 
                                        onClick={() => setAddingToDate(date)}
                                        className="w-full h-16 md:h-full rounded-xl border-2 border-dashed border-gray-100 text-gray-300 hover:border-nordic-primary hover:text-nordic-primary transition-all flex items-center justify-center gap-2 bg-white/50"
                                    >
                                        <Icons.Plus className="w-4 h-4" />
                                        <span className="font-medium text-xs">{t.addMeal}</span>
                                    </button>
                                ) : (
                                    <div className="w-full h-16 md:h-full rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center">
                                        <span className="text-xs text-gray-400 italic">{t.datePassed || "Date passed, no meal"}</span>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>

      {/* Drag Ghost Overlay */}
      {dragState && dragState.isDragging && createPortal(
          <div 
             className="fixed z-50 pointer-events-none shadow-2xl rounded-2xl bg-white overflow-hidden ring-2 ring-nordic-primary rotate-2 opacity-90"
             style={{
                 left: dragState.currentX - dragState.offsetX,
                 top: dragState.currentY - dragState.offsetY,
                 width: dragState.width,
                 height: dragState.height,
             }}
          >
             {dragState.draggedRecipe && (
                 <div className="flex p-2 gap-3 items-center">
                     <img src={dragState.draggedRecipe.images[0]} className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" alt="" />
                     <div className="flex-1 min-w-0">
                         <h4 className="font-semibold text-sm text-nordic-text truncate">{dragState.draggedRecipe.title}</h4>
                     </div>
                 </div>
             )}
          </div>,
          document.body
      )}

      {/* Rate Modal */}
      <Modal isOpen={!!ratingItem} onClose={() => setRatingItem(null)} title={t.rateTitle}>
          {ratingItem && (
             <div className="space-y-6">
                 <p className="text-sm text-gray-500">{t.howWas} {recipes.find(r => r.id === ratingItem.recipe_id)?.title}?</p>
                 <div className="flex justify-center gap-2">
                     {[1, 2, 3, 4, 5].map((star) => (
                         <button key={star} onClick={() => setRatingValue(star)} className="p-1 transition-transform active:scale-90">
                             <Icons.Star 
                                className={`w-10 h-10 ${star <= ratingValue ? 'text-nordic-accent' : 'text-gray-200'}`} 
                                fill={star <= ratingValue}
                             />
                         </button>
                     ))}
                 </div>
                 <Input 
                    placeholder={t.placeholder}
                    value={ratingComment}
                    onChange={(e: any) => setRatingComment(e.target.value)}
                 />
                 <Button onClick={handleSaveRating} disabled={ratingValue === 0} className="w-full">
                     {t.save}
                 </Button>
             </div>
          )}
      </Modal>

      {/* Add Meal Modal (Recipe Picker) */}
      <Modal isOpen={!!addingToDate} onClose={() => setAddingToDate(null)} title={t.selectRecipe}>
          <div className="space-y-4">
              <Input 
                 placeholder={t.searchPlaceholder}
                 value={searchTerm}
                 onChange={(e: any) => setSearchTerm(e.target.value)}
                 autoFocus
              />
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                  {filteredRecipes.length > 0 ? (
                      filteredRecipes.map(recipe => (
                          <div 
                            key={recipe.id} 
                            onClick={() => {
                                if (addingToDate) onAddMeal(addingToDate, recipe.id);
                                setAddingToDate(null);
                            }}
                            className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                          >
                              <img src={recipe.images[0]} className="w-12 h-12 rounded-lg object-cover bg-gray-100" alt={recipe.title} />
                              <div>
                                  <p className="font-bold text-sm text-nordic-text">{recipe.title}</p>
                                  <p className="text-xs text-gray-400">{recipe.servings_default} srv</p>
                              </div>
                          </div>
                      ))
                  ) : (
                      <p className="text-center text-sm text-gray-400 py-4">{t.noRecipesFound}</p>
                  )}
              </div>
          </div>
      </Modal>
    </div>
  );
};