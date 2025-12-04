import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Recipe, Language, MealPlanItem, Nutrition, SHOPPING_CATEGORIES, Ingredient, AppSettings } from '../types';
import { Button, Icons, Modal, Input, Badge } from './Shared';
import { generateRecipeImage, estimateNutrition, refineInstructions, suggestRecipeImprovement, ImprovementSuggestion } from '../services/geminiService';

interface RecipeDetailProps {
  recipe: Recipe;
  recipes?: Recipe[];
  meal?: MealPlanItem;
  plan?: MealPlanItem[]; // Passed to find ratings
  settings?: AppSettings;
  onClose: () => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onUpdateServings: (mealId: number, servings: number) => void;
  onAddMeal: (date: string, recipeId: number) => void;
  onRateMeal?: (id: number, rating: number, comment?: string) => void;
  t: any;
  language: string;
}

export const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipe, recipes = [], meal, plan, settings, onClose, onUpdateRecipe, onUpdateServings, onAddMeal, onRateMeal, t, language }) => {
  const [isCooking, setIsCooking] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showIngredientsOverlay, setShowIngredientsOverlay] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // New Sidebar State
  
  const [showDateSelect, setShowDateSelect] = useState(false);
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  // Versioning state
  const [viewedRecipe, setViewedRecipe] = useState<Recipe>(recipe);
  
  // AI Improvement State
  const [isImproving, setIsImproving] = useState(false);
  const [improvementSuggestion, setImprovementSuggestion] = useState<ImprovementSuggestion | null>(null);

  // Local serving state for visualization
  const [currentServings, setCurrentServings] = useState(meal?.servings || viewedRecipe.servings_default);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Rating state
  const [ratingValue, setRatingValue] = useState(meal?.rating || 0);
  const [ratingComment, setRatingComment] = useState(meal?.rating_comment || '');
  
  // Nutrition State
  const [nutrition, setNutrition] = useState<Nutrition | undefined>(viewedRecipe.nutrition);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [showNutritionDetails, setShowNutritionDetails] = useState(false);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState<Recipe>(viewedRecipe);
  const [isRefining, setIsRefining] = useState(false);

  // Track the ID or URL of the last AI generated image to enable replacement
  const lastGeneratedAiImageRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // Sidebar Refs for auto-scroll
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When the main recipe prop changes, reset to viewing the latest version
    setViewedRecipe(recipe);
  }, [recipe]);

  useEffect(() => {
    setCurrentServings(meal?.servings || viewedRecipe.servings_default);
    if (meal) {
        setRatingValue(meal.rating || 0);
        setRatingComment(meal.rating_comment || '');
    }
  }, [meal, viewedRecipe]);

  // Sync nutrition when recipe updates (e.g. if loaded elsewhere)
  useEffect(() => {
      setNutrition(viewedRecipe.nutrition);
      setEditedRecipe(viewedRecipe); // Sync edited recipe base on open
  }, [viewedRecipe]);

  // Reset image index when recipe changes (e.g. from context menu)
  useEffect(() => {
      setCurrentImageIndex(0);
  }, [viewedRecipe.id]);

  // Initialize sidebar open state based on screen width on mount
  useEffect(() => {
      if (typeof window !== 'undefined') {
          // If large screen, maybe default open? Let's keep closed for immersion but available.
          // Or responsive default: true for desktop.
          if (window.innerWidth >= 768) {
              setShowSidebar(true);
          }
      }
  }, []);

  // Derive unique cuisines
  const existingCuisines = useMemo(() => {
    const unique = new Map<string, string>(); // lowercase -> display
    recipes.forEach(r => {
        if (r.cuisine) {
            const c = r.cuisine.trim();
            const lower = c.toLowerCase();
            // Store the capitalized version if we encounter it
            if (!unique.has(lower) || (c[0] === c[0].toUpperCase() && unique.get(lower)![0] !== c[0])) {
                unique.set(lower, c);
            }
        }
    });
    return Array.from(unique.values()).sort();
  }, [recipes]);

  // Calculate ingredient scaling
  const scale = currentServings / viewedRecipe.servings_default;
  const isLatestVersion = viewedRecipe.version === recipe.version;

  // --- Helper to determine Dietary Label ---
  const getDietaryLabel = () => {
      const meatIngredients = viewedRecipe.ingredients.filter(i => 
          ['Meat', 'Fish', 'Poultry', 'Seafood'].includes(i.category)
      );

      if (meatIngredients.length === 0) return 'Vegetarian';

      const names = meatIngredients.map(i => i.item_name.toLowerCase()).join(' ');
      
      const fishKeywords = ['salmon', 'tuna', 'cod', 'fish', 'shrimp', 'prawn', 'crab', 'lobster', 'seafood', 'trout', 'haddock', 'scallop', 'mussel', 'clam'];
      const poultryKeywords = ['chicken', 'turkey', 'duck', 'goose', 'quail', 'poultry', 'hen'];

      if (fishKeywords.some(k => names.includes(k))) return 'Fish';
      if (poultryKeywords.some(k => names.includes(k))) return 'Poultry';

      return 'Meat';
  };

  // --- Wake Lock Effect ---
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isCooking) {
        try {
          // @ts-ignore
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.debug('Wake Lock request failed:', err);
        }
      }
    };

    if (isCooking) {
      requestWakeLock();
    } else {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    }

    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isCooking]);

  const handleImageUpdate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && viewedRecipe && isLatestVersion) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            // Add new image to the front of the list
            const updated = { 
                ...viewedRecipe, 
                images: [result, ...viewedRecipe.images] 
            };
            onUpdateRecipe(updated);
            setCurrentImageIndex(0);
        };
        reader.readAsDataURL(file);
    }
    // Reset input
    e.target.value = '';
  };
  
  const handleGenerateImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!viewedRecipe || !isLatestVersion) return;
    setIsGeneratingImage(true);
    try {
        const imageUrl = await generateRecipeImage(viewedRecipe.title, viewedRecipe.description);
        if (imageUrl) {
             let newImages = [...viewedRecipe.images];
             
             if (lastGeneratedAiImageRef.current && newImages.length > 0 && newImages[0] === lastGeneratedAiImageRef.current) {
                 newImages[0] = imageUrl;
             } else {
                 newImages = [imageUrl, ...newImages];
             }
             
             const updated = { ...viewedRecipe, images: newImages };
             lastGeneratedAiImageRef.current = imageUrl;
             
             onUpdateRecipe(updated);
             setCurrentImageIndex(0);
        }
    } catch (error) {
        console.error("Failed to generate image", error);
    } finally {
        setIsGeneratingImage(false);
    }
  };
  
  const handleCalculateNutrition = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!viewedRecipe || !isLatestVersion) return;
      setLoadingNutrition(true);
      setShowNutritionDetails(true);
      try {
          const data = await estimateNutrition(viewedRecipe.ingredients);
          setNutrition(data);
          onUpdateRecipe({ ...viewedRecipe, nutrition: data });
      } catch (error) {
          console.error("Failed to calculate nutrition", error);
      } finally {
          setLoadingNutrition(false);
      }
  };
  
  const changeServings = (delta: number) => {
      const newServings = Math.max(1, currentServings + delta);
      setCurrentServings(newServings);
      if (meal) {
          onUpdateServings(meal.id, newServings);
      }
  };

  const handleSaveRating = () => {
    if (meal && onRateMeal) {
        onRateMeal(meal.id, ratingValue, ratingComment);
    }
  };

  const startCooking = () => {
      setCurrentStep(0);
      setIsCooking(true);
  };

  const handleAddToPlan = () => {
      if (viewedRecipe && planDate && isLatestVersion) {
          onAddMeal(planDate, viewedRecipe.id);
          setShowDateSelect(false);
          onClose();
      }
  };

  const handleChangeVersion = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = parseInt(e.target.value);
      if (v === recipe.version) {
          setViewedRecipe(recipe);
      } else {
          const old = recipe.history?.find(h => h.version === v);
          if (old) setViewedRecipe(old);
      }
  };

  // --- AI Improvement Logic ---
  const handleSuggestImprovement = async () => {
      if (!isLatestVersion) return;
      setIsImproving(true);
      
      const context = `Adults: ${settings?.default_adults || 2}, Kids: ${settings?.default_kids || 0}`;
      const suggestion = await suggestRecipeImprovement(recipe, context);
      
      setImprovementSuggestion(suggestion);
      setIsImproving(false);
  };

  const acceptImprovement = () => {
      if (!improvementSuggestion || !isLatestVersion) return;
      
      const updated = {
          ...recipe,
          title: improvementSuggestion.changes.title_suffix 
            ? `${recipe.title} ${improvementSuggestion.changes.title_suffix}`
            : recipe.title,
          ingredients: improvementSuggestion.changes.ingredients,
          instructions: improvementSuggestion.changes.instructions
      };
      
      onUpdateRecipe(updated);
      setImprovementSuggestion(null);
  };
  
  // --- Edit Mode Handlers ---
  
  const handleEditIngredient = (index: number, field: keyof Ingredient, value: any) => {
      const newIngredients = [...editedRecipe.ingredients];
      newIngredients[index] = { ...newIngredients[index], [field]: value };
      setEditedRecipe({ ...editedRecipe, ingredients: newIngredients });
  };
  
  const handleDeleteIngredient = (index: number) => {
      const newIngredients = editedRecipe.ingredients.filter((_, i) => i !== index);
      setEditedRecipe({ ...editedRecipe, ingredients: newIngredients });
  };
  
  const handleAddIngredient = () => {
      setEditedRecipe({
          ...editedRecipe,
          ingredients: [...editedRecipe.ingredients, { item_name: '', quantity: 1, unit: 'pc', category: 'Other' }]
      });
  };

  const handleEditInstruction = (index: number, value: string) => {
      const newInstructions = [...editedRecipe.instructions];
      newInstructions[index] = value;
      setEditedRecipe({ ...editedRecipe, instructions: newInstructions });
  };
  
  const handleDeleteInstruction = (index: number) => {
      const newInstructions = editedRecipe.instructions.filter((_, i) => i !== index);
      setEditedRecipe({ ...editedRecipe, instructions: newInstructions });
  };
  
  const handleAddInstruction = () => {
      setEditedRecipe({
          ...editedRecipe,
          instructions: [...editedRecipe.instructions, '']
      });
  };

  const handleAiRefine = async (mode: 'detailed' | 'simple') => {
      setIsRefining(true);
      try {
          const ingredientNames = editedRecipe.ingredients.map(i => i.item_name);
          const newSteps = await refineInstructions(editedRecipe.title, ingredientNames, editedRecipe.instructions, mode);
          setEditedRecipe({ ...editedRecipe, instructions: newSteps });
      } catch (e) {
          // Handle error gracefully
          console.error(e);
      } finally {
          setIsRefining(false);
      }
  };

  const saveEdit = () => {
      onUpdateRecipe(editedRecipe);
      setIsEditing(false);
  };

  const handleSidebarClick = (index: number) => {
      setCurrentStep(index);
      if (window.innerWidth < 768) {
          setShowSidebar(false); // Auto close on mobile
      }
  };

  // --- Cooking Mode Render (Immersive) ---
  if (isCooking) {
      const stepCount = viewedRecipe.instructions.length;
      const progress = ((currentStep + 1) / stepCount) * 100;

      return (
          <div className="fixed inset-0 z-[60] bg-white flex flex-col animate-in fade-in duration-300">
              {/* Top Bar */}
              <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-white z-20 shadow-sm relative">
                  <div className="flex items-center gap-2">
                       <Button variant="ghost" onClick={() => setIsCooking(false)} className="!p-1.5 h-8 w-8">
                           <Icons.X className="w-5 h-5" />
                       </Button>
                       <div>
                           <h2 className="font-bold text-xs text-nordic-secondary">{t.step} {currentStep + 1} / {stepCount}</h2>
                       </div>
                  </div>
                  
                  {/* Progress Bar (Integrated) */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
                      <div className="h-full bg-nordic-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setShowIngredientsOverlay(!showIngredientsOverlay)} className="text-[10px] !py-1.5 !px-3 h-8">
                          {t.ingredients}
                      </Button>
                      <Button 
                          variant={showSidebar ? 'primary' : 'secondary'} 
                          onClick={() => setShowSidebar(!showSidebar)} 
                          className="!p-1.5 h-8 w-8"
                      >
                          <Icons.List className="w-4 h-4" />
                      </Button>
                  </div>
              </div>

              <div className="flex-1 flex overflow-hidden relative">
                  {/* Sidebar Navigation */}
                  <div 
                      ref={sidebarRef}
                      className={`
                          absolute inset-y-0 left-0 z-10 w-64 bg-gray-50 border-r border-gray-100 overflow-y-auto transition-transform duration-300
                          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
                          md:relative md:translate-x-0 md:w-64 md:flex-shrink-0
                          ${!showSidebar && 'md:hidden'} 
                      `}
                  >
                      <div className="p-4 space-y-2">
                          <h3 className="text-xs font-bold uppercase text-nordic-muted mb-4 px-2">{t.preview}</h3>
                          {viewedRecipe.instructions.map((step, index) => {
                              const isActive = index === currentStep;
                              const isCompleted = index < currentStep;
                              return (
                                  <button
                                      key={index}
                                      onClick={() => handleSidebarClick(index)}
                                      className={`w-full text-left p-3 rounded-xl text-xs transition-all duration-200 border border-transparent
                                          ${isActive ? 'bg-white shadow-md border-gray-100 text-nordic-primary font-bold' : ''}
                                          ${!isActive && isCompleted ? 'text-gray-400 bg-gray-100/50' : ''}
                                          ${!isActive && !isCompleted ? 'text-gray-600 hover:bg-gray-100' : ''}
                                      `}
                                  >
                                      <div className="flex gap-2">
                                          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${isActive ? 'bg-nordic-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                                              {index + 1}
                                          </span>
                                          <span className="line-clamp-2 leading-relaxed flex-1">{step}</span>
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
                       {/* Ingredients Overlay - Positioned over content area only */}
                       {showIngredientsOverlay && (
                           <div className="absolute inset-0 bg-white/95 backdrop-blur z-20 p-6 overflow-y-auto text-left animate-in slide-in-from-top-10">
                               <h3 className="font-bold text-xl mb-4 text-nordic-primary">{t.ingredients}</h3>
                               <ul className="space-y-3">
                                   {viewedRecipe.ingredients.map((ing, idx) => (
                                       <li key={idx} className="flex items-baseline justify-between border-b border-gray-100 pb-2">
                                           <span className="font-medium text-slate-800">{ing.item_name}</span>
                                           <span className="text-slate-500">
                                               {parseFloat((ing.quantity * scale).toFixed(2))} {ing.unit}
                                           </span>
                                       </li>
                                   ))}
                               </ul>
                               <Button className="mt-8 w-full" onClick={() => setShowIngredientsOverlay(false)}>{t.closeIng}</Button>
                           </div>
                       )}

                       <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center items-center text-center">
                           <div className="max-w-md w-full">
                               <span className="inline-block text-6xl font-black text-gray-100 mb-6 select-none">{currentStep + 1}</span>
                               <p className="text-xl md:text-3xl font-bold text-slate-800 leading-tight">
                                   {viewedRecipe.instructions[currentStep]}
                               </p>
                           </div>
                       </div>

                       {/* Controls */}
                       <div className="p-3 border-t border-gray-100 bg-gray-50 pb-safe grid grid-cols-2 gap-3 shrink-0 z-20">
                          <Button 
                            variant="secondary" 
                            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                            disabled={currentStep === 0}
                            className="h-14 text-base disabled:opacity-50"
                          >
                              <Icons.ArrowLeft className="w-5 h-5" /> {t.prev}
                          </Button>
                          {currentStep < stepCount - 1 ? (
                              <Button 
                                onClick={() => setCurrentStep(currentStep + 1)}
                                className="h-14 text-base"
                              >
                                  {t.next} <Icons.ArrowRight className="w-5 h-5" />
                              </Button>
                          ) : (
                              <Button 
                                variant="primary"
                                onClick={() => setIsCooking(false)}
                                className="h-14 text-base"
                              >
                                  {t.finish} <Icons.Check className="w-5 h-5" />
                              </Button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- Compact Detail View ---
  return (
    <Modal isOpen={true} onClose={onClose} padding="p-0">
       <div className="relative h-48 w-full bg-gray-100 group select-none">
          <img src={viewedRecipe.images[currentImageIndex]} className="w-full h-full object-cover transition-opacity duration-300" />
          
          {/* Gradients & Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
          
          {/* Top Controls */}
          <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10">
             <div className="flex gap-2">
                 <Badge variant="default">{getDietaryLabel()}</Badge>
                 {viewedRecipe.cuisine && <Badge variant="accent">{viewedRecipe.cuisine}</Badge>}
                 {/* Image Gen/Upload buttons compact - Only for latest version */}
                 {isLatestVersion && (
                     <>
                        <button onClick={handleGenerateImage} disabled={isGeneratingImage} className="bg-black/30 backdrop-blur text-white p-1.5 rounded-full hover:bg-black/50 transition-colors">
                            {isGeneratingImage ? <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" /> : <Icons.Sparkles className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => imageInputRef.current?.click()} className="bg-black/30 backdrop-blur text-white p-1.5 rounded-full hover:bg-black/50 transition-colors">
                            <Icons.Camera className="w-3.5 h-3.5" />
                        </button>
                        <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpdate} />
                     </>
                 )}
             </div>

             <div className="flex gap-2">
                 {/* Edit Toggle - Only for latest */}
                 {isLatestVersion && (
                     <button onClick={() => setIsEditing(!isEditing)} className={`backdrop-blur p-1.5 rounded-full transition-colors ${isEditing ? 'bg-white text-nordic-primary' : 'bg-black/30 text-white hover:bg-black/50'}`}>
                        <Icons.Edit className="w-3.5 h-3.5" />
                     </button>
                 )}
                 <button onClick={onClose} className="bg-black/30 backdrop-blur text-white p-1.5 rounded-full hover:bg-black/50 transition-colors">
                    <Icons.X className="w-3.5 h-3.5" />
                 </button>
             </div>
          </div>

          {/* Bottom Title & Rating */}
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white pointer-events-auto">
              {isEditing ? (
                  <input 
                      value={editedRecipe.title}
                      onChange={e => setEditedRecipe({...editedRecipe, title: e.target.value})}
                      className="w-full bg-black/40 text-white border-b border-white/50 focus:border-white outline-none font-bold text-xl mb-2 placeholder-white/50"
                      placeholder="Recipe Title"
                  />
              ) : (
                  <h2 className="text-xl font-bold leading-tight mb-1 drop-shadow-md">{viewedRecipe.title}</h2>
              )}
              
              <div className="flex items-center gap-2 text-xs opacity-90 font-medium">
                  {/* Version Selector */}
                  {(recipe.history?.length || 0) > 0 && (
                      <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md rounded-lg p-0.5 px-2">
                         <label className="text-[9px] uppercase font-bold opacity-70">{t.viewVersion}</label>
                         <select 
                            value={viewedRecipe.version} 
                            onChange={handleChangeVersion}
                            className="bg-transparent text-white font-bold outline-none border-none text-xs appearance-none cursor-pointer"
                         >
                             <option className="text-black" value={recipe.version}>{recipe.version} ({t.current})</option>
                             {recipe.history?.map(h => (
                                 <option className="text-black" key={h.version} value={h.version}>v{h.version}</option>
                             )).reverse()}
                         </select>
                      </div>
                  )}

                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm">
                      <Icons.Star className="w-3 h-3 text-nordic-accent" fill={true} />
                      <span>{meal?.rating || viewedRecipe.rating || '-'}</span>
                  </div>
                  <span>•</span>
                  <span>{viewedRecipe.instructions.length} {t.step}</span>
                  <div className="ml-auto flex items-center gap-1 bg-white/20 backdrop-blur-md rounded-lg p-0.5">
                      <button onClick={(e) => {e.stopPropagation(); changeServings(-1)}} className="hover:bg-white/20 rounded p-1"><Icons.Minus className="w-3 h-3 text-white"/></button>
                      <span className="font-bold min-w-[2ch] text-center">{currentServings}</span>
                      <button onClick={(e) => {e.stopPropagation(); changeServings(1)}} className="hover:bg-white/20 rounded p-1"><Icons.Plus className="w-3 h-3 text-white"/></button>
                  </div>
              </div>
          </div>
       </div>

       {/* Content Body */}
       <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          
          {!isLatestVersion && (
              <div className="bg-amber-50 border border-amber-200 p-2 rounded-lg text-center">
                  <p className="text-xs text-amber-800 font-medium">{t.oldVersionWarning}</p>
              </div>
          )}

          {isEditing ? (
              // --- EDIT MODE ---
              <div className="space-y-6">
                   {/* Actions */}
                   <div className="flex gap-2">
                       <Button onClick={saveEdit} className="flex-1 py-2 text-sm h-10 bg-green-600 hover:bg-green-700">
                           <Icons.Check className="w-4 h-4" /> {t.saveChanges}
                       </Button>
                       <Button variant="secondary" onClick={() => setIsEditing(false)} className="flex-1 py-2 text-sm h-10">
                           {t.discardChanges}
                       </Button>
                   </div>

                   {/* Cuisine Edit */}
                   <div>
                       <label className="text-[10px] text-gray-500 uppercase font-bold">{t.cuisine}</label>
                       <Input 
                           value={editedRecipe.cuisine || ''}
                           onChange={(e: any) => setEditedRecipe({ ...editedRecipe, cuisine: e.target.value })}
                           placeholder="e.g. Italian"
                           className="!py-1.5 text-sm mt-1"
                           list="cuisine-suggestions"
                       />
                       <datalist id="cuisine-suggestions">
                           {existingCuisines.map(c => <option key={c} value={c} />)}
                       </datalist>
                   </div>
                   
                   {/* Ingredients Editor */}
                   <div>
                       <h3 className="font-bold text-xs text-nordic-muted mb-2 uppercase tracking-wide px-1">{t.ingredients}</h3>
                       <div className="space-y-2">
                           {editedRecipe.ingredients.map((ing, i) => (
                               <div key={i} className="flex gap-2 items-center">
                                   <Input 
                                        value={ing.quantity} 
                                        type="number" 
                                        onChange={(e: any) => handleEditIngredient(i, 'quantity', parseFloat(e.target.value))}
                                        className="w-16 !p-1.5 text-xs text-center" 
                                   />
                                   <Input 
                                        value={ing.unit} 
                                        onChange={(e: any) => handleEditIngredient(i, 'unit', e.target.value)}
                                        className="w-16 !p-1.5 text-xs text-center" 
                                   />
                                   <Input 
                                        value={ing.item_name} 
                                        onChange={(e: any) => handleEditIngredient(i, 'item_name', e.target.value)}
                                        className="flex-1 !p-1.5 text-xs" 
                                        placeholder="Name"
                                   />
                                   <select 
                                        value={ing.category}
                                        onChange={(e) => handleEditIngredient(i, 'category', e.target.value)}
                                        className="w-20 text-[10px] p-1.5 bg-gray-50 border border-gray-200 rounded-xl"
                                   >
                                        {SHOPPING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                   </select>
                                   <button onClick={() => handleDeleteIngredient(i)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-full">
                                       <Icons.X className="w-4 h-4" />
                                   </button>
                               </div>
                           ))}
                           <Button variant="secondary" onClick={handleAddIngredient} className="w-full text-xs h-8">
                               <Icons.Plus className="w-3 h-3" /> {t.addIngredient}
                           </Button>
                       </div>
                   </div>

                   {/* Instructions Editor */}
                   <div>
                       <div className="flex justify-between items-center mb-2 px-1">
                           <h3 className="font-bold text-xs text-nordic-muted uppercase tracking-wide">{t.preview}</h3>
                           {/* AI Magic Buttons */}
                           <div className="flex gap-1">
                               <button 
                                  onClick={() => handleAiRefine('detailed')} 
                                  disabled={isRefining}
                                  className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-100 disabled:opacity-50"
                               >
                                  {isRefining ? <span className="animate-pulse">{t.refining}</span> : <><Icons.Sparkles className="w-3 h-3" /> {t.makeDetailed}</>}
                               </button>
                               <button 
                                  onClick={() => handleAiRefine('simple')} 
                                  disabled={isRefining}
                                  className="text-[9px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full hover:bg-gray-200 disabled:opacity-50"
                               >
                                  {t.simplify}
                               </button>
                           </div>
                       </div>
                       
                       <div className="space-y-2">
                           {editedRecipe.instructions.map((step, i) => (
                               <div key={i} className="flex gap-2 items-start">
                                   <span className="text-xs font-bold text-gray-300 mt-2 w-4 text-center">{i + 1}</span>
                                   <textarea 
                                       value={step}
                                       onChange={(e) => handleEditInstruction(i, e.target.value)}
                                       className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[60px] resize-y focus:border-nordic-primary outline-none"
                                   />
                                   <button onClick={() => handleDeleteInstruction(i)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-full mt-1">
                                       <Icons.X className="w-4 h-4" />
                                   </button>
                               </div>
                           ))}
                           <Button variant="secondary" onClick={handleAddInstruction} className="w-full text-xs h-8">
                               <Icons.Plus className="w-3 h-3" /> {t.addStep}
                           </Button>
                       </div>
                   </div>
              </div>
          ) : (
              // --- VIEW MODE ---
              <>
                {/* Main Actions Row */}
                <div className="flex gap-2">
                    <Button onClick={startCooking} className="flex-1 py-2 text-sm h-10"><Icons.Play className="w-4 h-4" /> {t.startCooking}</Button>
                    {isLatestVersion ? (
                         <Button variant="secondary" onClick={() => { setShowDateSelect(!showDateSelect) }} className={`flex-1 py-2 text-sm h-10 ${showDateSelect ? 'bg-gray-100' : ''}`}><Icons.Plan className="w-4 h-4" /> {t.addToPlan}</Button>
                    ) : (
                        <Button variant="secondary" disabled className="flex-1 py-2 text-sm h-10 opacity-50"><Icons.Plan className="w-4 h-4" /> {t.addToPlan}</Button>
                    )}
                </div>
                
                {isLatestVersion && (
                     <Button 
                         variant="secondary" 
                         onClick={handleSuggestImprovement} 
                         disabled={isImproving}
                         className="w-full h-8 text-xs bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100"
                     >
                         {isImproving ? (
                             <span className="flex items-center gap-2">
                                 <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                 {t.improving}
                             </span>
                         ) : (
                             <span className="flex items-center gap-2">
                                 <Icons.Sparkles className="w-3 h-3" /> {t.improve}
                             </span>
                         )}
                     </Button>
                )}

                {/* Date Picker (Conditional) */}
                {showDateSelect && (
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 animate-in slide-in-from-top-2">
                        <label className="text-xs font-bold text-gray-500 mb-2 block">{t.selectDate}</label>
                        <div className="flex gap-2">
                            <Input type="date" value={planDate} onChange={(e:any) => setPlanDate(e.target.value)} className="!py-1.5 text-sm flex-1" />
                            <Button onClick={handleAddToPlan} className="!py-1.5 text-sm">{t.confirmAdd}</Button>
                        </div>
                    </div>
                )}
                
                {/* Ingredients (Compact) */}
                <div>
                    <h3 className="font-bold text-xs text-nordic-muted mb-2 uppercase tracking-wide px-1">{t.ingredients}</h3>
                    <div className="grid grid-cols-1 gap-y-1">
                        {viewedRecipe.ingredients.map((ing, i) => (
                            <div key={i} className="flex justify-between items-baseline text-sm py-1 border-b border-dashed border-gray-100 last:border-0 hover:bg-gray-50 px-1 rounded transition-colors">
                                <span className="text-gray-700">{ing.item_name}</span>
                                <span className="text-gray-500 font-medium whitespace-nowrap ml-2 text-xs">
                                    {parseFloat((ing.quantity * scale).toFixed(1))} {ing.unit}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Steps Preview */}
                <div>
                    <h3 className="font-bold text-xs text-nordic-muted mb-2 uppercase tracking-wide px-1">{t.preview}</h3>
                    <div className="space-y-2">
                        {viewedRecipe.instructions.slice(0, 3).map((step, i) => (
                            <div key={i} className="flex gap-3 text-xs text-gray-600 px-1">
                                <span className="font-bold text-gray-300 select-none">{i + 1}</span>
                                <p className="line-clamp-2 leading-relaxed">{step}</p>
                            </div>
                        ))}
                        {viewedRecipe.instructions.length > 3 && (
                            <p className="text-[10px] text-center text-gray-400 italic pt-1">
                                + {viewedRecipe.instructions.length - 3} more steps
                            </p>
                        )}
                    </div>
                </div>

                {/* Reviews for this version */}
                {plan && (
                    <div className="space-y-2">
                        <h3 className="font-bold text-xs text-nordic-muted uppercase tracking-wide px-1">{t.reviewsForVersion} (v{viewedRecipe.version})</h3>
                        {(() => {
                            const relevantMeals = plan.filter(p => p.recipe_id === viewedRecipe.id && p.recipe_version === viewedRecipe.version && p.rating_comment);
                            if (relevantMeals.length === 0) return <p className="text-xs text-gray-400 italic px-1">No reviews for this version.</p>;
                            return (
                                <div className="space-y-2">
                                    {relevantMeals.map(p => (
                                        <div key={p.id} className="bg-gray-50 p-2 rounded-lg text-xs">
                                            <div className="flex items-center gap-1 mb-1">
                                                <Icons.Star className="w-3 h-3 text-orange-400" fill={true} />
                                                <span className="font-bold">{p.rating}</span>
                                                <span className="text-gray-400 ml-auto">{p.date}</span>
                                            </div>
                                            <p className="text-gray-700">{p.rating_comment}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}


                {/* Rating Section (Reintroduced - Only for cooked meal) */}
                {meal && onRateMeal && (
                    <div className="bg-yellow-50/50 rounded-xl p-3 border border-yellow-100/50">
                        <h3 className="font-bold text-[10px] text-yellow-800 uppercase tracking-wide mb-2">{t.rateMeal}</h3>
                        <div className="flex gap-4 items-start">
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onClick={() => setRatingValue(star)}
                                        className="focus:outline-none transition-transform active:scale-90"
                                    >
                                        <Icons.Star
                                            className={`w-6 h-6 ${star <= ratingValue ? 'text-nordic-accent' : 'text-gray-300'}`}
                                            fill={star <= ratingValue}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                            <Input
                                placeholder={t.commentPlaceholder}
                                value={ratingComment}
                                onChange={(e: any) => setRatingComment(e.target.value)}
                                className="!py-1.5 !px-3 text-sm bg-white"
                            />
                            <Button onClick={handleSaveRating} disabled={ratingValue === 0} className="!py-1.5 h-auto text-xs px-3">
                                {t.saveRating}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Nutrition (Collapsible) */}
                <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                    <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowNutritionDetails(!showNutritionDetails)}>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-[10px] text-nordic-muted uppercase tracking-wide">{t.nutritionTitle}</h3>
                            {/* Summary Line */}
                            {nutrition ? (
                                <span className="text-[10px] text-gray-500 font-medium">
                                    {Math.round(nutrition.calories)} {t.cal} • {Math.round(nutrition.protein)}g {t.prot}
                                </span>
                            ) : (
                                <span className="text-[10px] text-gray-400 italic">{t.noNutrition}</span>
                            )}
                        </div>
                        <button className="text-gray-400">
                            {showNutritionDetails ? <Icons.ChevronUp className="w-3.5 h-3.5" /> : <Icons.ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    
                    {showNutritionDetails && (
                        <div className="mt-2 pt-2 border-t border-gray-200 animate-in slide-in-from-top-1">
                            {nutrition ? (
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-white p-1 rounded border border-gray-100">
                                        <p className="text-[9px] text-gray-400 uppercase">{t.carb}</p>
                                        <p className="text-xs font-bold text-gray-700">{Math.round(nutrition.carbs)}</p>
                                    </div>
                                    <div className="bg-white p-1 rounded border border-gray-100">
                                        <p className="text-[9px] text-gray-400 uppercase">{t.fat}</p>
                                        <p className="text-xs font-bold text-gray-700">{Math.round(nutrition.fat)}</p>
                                    </div>
                                    <div className="bg-white p-1 rounded border border-gray-100">
                                        <p className="text-[9px] text-gray-400 uppercase">{t.satFat}</p>
                                        <p className="text-xs font-bold text-gray-700">{Math.round(nutrition.saturated_fat)}</p>
                                    </div>
                                    <div className="bg-white p-1 rounded border border-gray-100">
                                        <p className="text-[9px] text-gray-400 uppercase">{t.fiber}</p>
                                        <p className="text-xs font-bold text-gray-700">{Math.round(nutrition.fiber)}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center pt-1">
                                    <Button variant="ghost" onClick={handleCalculateNutrition} disabled={loadingNutrition} className="text-xs w-full h-8">
                                        {loadingNutrition ? t.calculating : t.calcNutrition}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
              </>
          )}
       </div>

       {/* AI Suggestion Modal */}
       <Modal isOpen={!!improvementSuggestion} onClose={() => setImprovementSuggestion(null)} title={t.improveTitle}>
           {improvementSuggestion && (
               <div className="space-y-4">
                   <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl">
                       <p className="text-indigo-900 text-sm italic">"{improvementSuggestion.motivation}"</p>
                   </div>
                   
                   <div>
                       <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wide mb-2">Summary of Changes</h4>
                       <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                           <li>Ingredients modified</li>
                           <li>Instructions updated</li>
                           {improvementSuggestion.changes.title_suffix && <li>Title updated to: {recipe.title} {improvementSuggestion.changes.title_suffix}</li>}
                       </ul>
                   </div>

                   <div className="flex gap-2 pt-2">
                       <Button onClick={acceptImprovement} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                           {t.acceptImprovement}
                       </Button>
                       <Button variant="secondary" onClick={() => setImprovementSuggestion(null)} className="flex-1">
                           {t.rejectImprovement}
                       </Button>
                   </div>
               </div>
           )}
       </Modal>
    </Modal>
  )
}