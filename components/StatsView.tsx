import React, { useMemo } from 'react';
import { MealPlanItem, Recipe, Language } from '../types';
import { Card, Icons } from './Shared';

interface StatsViewProps {
  plan: MealPlanItem[];
  recipes: Recipe[];
  t: any;
  language: string;
}

export const StatsView: React.FC<StatsViewProps> = ({ plan, recipes, t, language }) => {

    // Filter plan to only include history (up to today)
    const historyPlan = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        return plan.filter(p => p.date <= todayStr);
    }, [plan]);

    const stats = useMemo(() => {
        if (!historyPlan.length) return null;

        // 1. Most Frequent Meal in Plan (History Only)
        const counts: Record<number, number> = {};
        historyPlan.forEach(p => { counts[p.recipe_id] = (counts[p.recipe_id] || 0) + 1; });
        const sortedIds = Object.keys(counts).sort((a, b) => counts[Number(b)] - counts[Number(a)]);
        const mostPopularId = Number(sortedIds[0]);
        const mostPopularCount = counts[mostPopularId];
        const mostPopularRecipe = recipes.find(r => r.id === mostPopularId);

        // 2. Best Rated (Calculated from Reviews in History)
        // Aggregate ratings per recipe
        const recipeRatings: Record<number, number[]> = {};
        historyPlan.forEach(p => {
            if (p.rating && p.rating > 0) {
                if (!recipeRatings[p.recipe_id]) recipeRatings[p.recipe_id] = [];
                recipeRatings[p.recipe_id].push(p.rating);
            }
        });

        let bestRatedRecipe: Recipe | undefined = undefined;
        let bestAvg = 0;

        Object.keys(recipeRatings).forEach(idStr => {
            const id = Number(idStr);
            const ratings = recipeRatings[id];
            const avg = ratings.reduce((a,b) => a+b, 0) / ratings.length;
            
            // Prefer higher count if averages are close
            if (avg > bestAvg || (avg === bestAvg && ratings.length > (recipeRatings[bestRatedRecipe?.id || 0]?.length || 0))) {
                bestAvg = avg;
                bestRatedRecipe = recipes.find(r => r.id === id);
            }
        });
        
        if (!bestRatedRecipe && historyPlan.length > 0) {
             // Find the highest rated recipe that actually appears in the history
             const uniqueHistoryRecipeIds = new Set(historyPlan.map(p => p.recipe_id));
             bestRatedRecipe = [...recipes]
                .filter(r => uniqueHistoryRecipeIds.has(r.id))
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
             
             if (bestRatedRecipe) bestAvg = bestRatedRecipe.rating || 0;
        }

        // 3. Top Cuisine
        const cuisineCounts: Record<string, number> = {};
        historyPlan.forEach(p => {
             const r = recipes.find(rec => rec.id === p.recipe_id);
             if (r?.cuisine) {
                 cuisineCounts[r.cuisine] = (cuisineCounts[r.cuisine] || 0) + 1;
             }
        });
        const sortedCuisines = Object.keys(cuisineCounts).sort((a, b) => cuisineCounts[b] - cuisineCounts[a]);
        const topCuisine = sortedCuisines.length > 0 ? sortedCuisines[0] : null;
        const topCuisineCount = topCuisine ? cuisineCounts[topCuisine] : 0;

        // 4. Protein Breakdown (Dietary)
        let beef = 0, pork = 0, poultry = 0, fish = 0, veg = 0;
        
        historyPlan.forEach(item => {
            const recipe = recipes.find(r => r.id === item.recipe_id);
            if (!recipe) return;

            const meatIngredients = recipe.ingredients.filter(i => 
                ['Meat', 'Fish', 'Poultry', 'Seafood'].includes(i.category)
            );

            if (meatIngredients.length === 0) {
                veg++;
                return;
            }

            const names = meatIngredients.map(i => i.item_name.toLowerCase()).join(' ');
            
            let isFish = ['salmon', 'tuna', 'cod', 'fish', 'shrimp', 'prawn', 'crab', 'lobster', 'seafood'].some(k => names.includes(k));
            let isPoultry = ['chicken', 'turkey', 'duck', 'goose', 'hen', 'poultry'].some(k => names.includes(k));
            let isBeef = ['beef', 'steak', 'mince', 'burger', 'meatball', 'veal', 'ox'].some(k => names.includes(k));
            let isPork = ['pork', 'bacon', 'ham', 'sausage', 'chorizo'].some(k => names.includes(k));
            
            let matched = false;
            if (isFish) { fish++; matched = true; }
            if (isPoultry) { poultry++; matched = true; }
            if (isBeef) { beef++; matched = true; }
            if (isPork) { pork++; matched = true; }
            
            if (!matched) beef++; // Default
        });

        const totalMeals = historyPlan.length;
        const vegRatio = veg > 0 ? (totalMeals / veg) : 0;
        const vegText = veg > 0 
            ? `${t.oneIn} ${Math.max(1, Math.round(vegRatio))} ${t.meals}`
            : `0 ${t.meals}`;

        return {
            mostPopularRecipe,
            mostPopularCount,
            bestRatedRecipe,
            bestAvg,
            topCuisine,
            topCuisineCount,
            counts: { beef, pork, poultry, fish, veg },
            totalMeals,
            vegText
        };
    }, [historyPlan, recipes, language]);

    if (!stats) return <div className="p-10 text-center text-gray-400 text-sm">{t.noData}</div>;

    const { counts, totalMeals } = stats;

    const Bar = ({ label, value, colorClass }: any) => (
        <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">{label}</span>
                <span className="text-gray-500">{value} {t.meals}</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full ${colorClass}`} 
                    style={{ width: `${(value / totalMeals) * 100}%` }}
                />
            </div>
        </div>
    );

    return (
        <div className="pb-24 space-y-4 px-1">
             <div className="mb-2">
                <h1 className="text-xl font-bold text-nordic-text">{t.stats_title}</h1>
                <p className="text-nordic-muted text-xs">{t.stats_subtitle}</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-bold">Based on {totalMeals} past meals</p>
            </div>

            {/* Highlights Grid */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 bg-gradient-to-br from-teal-50 to-white border-teal-100">
                    <h3 className="text-[10px] uppercase font-bold text-teal-800 tracking-wide mb-2 flex items-center gap-1">
                        <Icons.Star className="w-3 h-3" /> {t.bestRated}
                    </h3>
                    {stats.bestRatedRecipe ? (
                        <div>
                            <p className="font-bold text-sm truncate">{stats.bestRatedRecipe.title}</p>
                            <div className="flex items-center gap-1 mt-1">
                                <Icons.Star className="w-3 h-3 text-orange-400" fill={true} />
                                <span className="text-xs font-bold">{stats.bestAvg.toFixed(1)}</span>
                            </div>
                        </div>
                    ) : <p className="text-xs text-gray-400">-</p>}
                </Card>

                 <Card className="p-3 bg-gradient-to-br from-amber-50 to-white border-amber-100">
                    <h3 className="text-[10px] uppercase font-bold text-amber-800 tracking-wide mb-2 flex items-center gap-1">
                         <Icons.Chart className="w-3 h-3" /> {t.mostPopular}
                    </h3>
                    {stats.mostPopularRecipe ? (
                        <div>
                             <p className="font-bold text-sm truncate">{stats.mostPopularRecipe.title}</p>
                             <p className="text-xs text-amber-600 mt-1">{stats.mostPopularCount}x {t.meals}</p>
                        </div>
                    ) : <p className="text-xs text-gray-400">-</p>}
                </Card>
                
                {/* Top Cuisine Card */}
                {stats.topCuisine && (
                    <Card className="col-span-2 p-3 bg-gradient-to-br from-indigo-50 to-white border-indigo-100 flex items-center justify-between">
                         <div>
                            <h3 className="text-[10px] uppercase font-bold text-indigo-800 tracking-wide mb-1 flex items-center gap-1">
                                <span className="text-lg">🌍</span> {t.topCuisine}
                            </h3>
                            <p className="font-bold text-lg text-indigo-900">{stats.topCuisine}</p>
                         </div>
                         <div className="text-right">
                             <span className="text-xs font-bold text-indigo-400 block">{stats.topCuisineCount} {t.meals}</span>
                             <div className="w-16 h-1.5 bg-indigo-100 rounded-full mt-1 overflow-hidden">
                                 <div className="h-full bg-indigo-400" style={{ width: `${(stats.topCuisineCount / totalMeals) * 100}%`}} />
                             </div>
                         </div>
                    </Card>
                )}
            </div>

            {/* Veg Frequency Card */}
            <Card className="p-4 flex items-center justify-between">
                <div>
                     <h3 className="text-xs font-bold text-nordic-text">{t.vegetarianFreq}</h3>
                     <p className="text-2xl font-bold text-nordic-primary mt-1">{stats.vegText}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <span className="text-lg">🌿</span>
                </div>
            </Card>

            {/* Breakdown Chart */}
            <Card className="p-4">
                <h3 className="text-xs font-bold text-nordic-text mb-4">{t.meatCons}</h3>
                <Bar label={t.beef} value={counts.beef} colorClass="bg-red-400" />
                <Bar label={t.pork} value={counts.pork} colorClass="bg-rose-300" />
                <Bar label={t.poultry} value={counts.poultry} colorClass="bg-yellow-400" />
                <Bar label={t.fish} value={counts.fish} colorClass="bg-blue-400" />
                <Bar label={t.vegetarian} value={counts.veg} colorClass="bg-green-400" />
            </Card>
        </div>
    );
};
