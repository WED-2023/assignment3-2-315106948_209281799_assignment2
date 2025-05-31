const axios = require("axios");
const { param } = require("../user");
const api_domain = "https://api.spoonacular.com/recipes";
let added_recipes = [];



/**
 * Get recipes list from spooncular response and extract the relevant recipe data for preview
 * @param {*} recipes_info 
 */

/**
 * Req #6: Return 3 random recipes
 */
async function getThreeRandomRecipes(){
    firstRecipe = axios.get(`${api_domain}/random`, {
        params: {
        apiKey: process.env.spooncular_apiKey
        }
    });
    secondRecipe = axios.get(`${api_domain}/random`, {
        params: {
        apiKey: process.env.spooncular_apiKey
        }
    });   
    thirdRecipe = axios.get(`${api_domain}/random`, {
        params: {
        apiKey: process.env.spooncular_apiKey
        }
    });
    let recipes = await Promise.all([firstRecipe, secondRecipe, thirdRecipe]);
    let recipes_list = [];
    recipes.forEach(recipe => {
        let { id, title, readyInMinutes, image, aggregateLikes, vegan, vegetarian, glutenFree } = recipe.data.recipes[0];
        recipes_list.push({
            id: id,
            title: title,
            readyInMinutes: readyInMinutes,
            image: image,
            popularity: aggregateLikes,
            vegan: vegan,
            vegetarian: vegetarian,
            glutenFree: glutenFree
        });
    });
    return recipes_list;
}

/**
 * Req #6: Return the last 3 recipes the user watched
 */
async function getThreeWatchedRecipes(userId){
    return [];
}

/**
 * Req #8: Return recipe details by name
 */
async function getRecipeDetailsByName(recipe_name,number=5) {
    let recipe_info = await axios.get(`${api_domain}/complexSearch`, {
        params: {
            query: recipe_name,
            number: number, // number of recipes to return
            apiKey: process.env.spooncular_apiKey
        }
    });
    if (!recipe_info.data.results || recipe_info.data.length === 0) {
        throw { status: 404, message: "Recipe not found" };
    }
    return await getRecipeDetails(recipe_info.data[0].id);
}

/**
 * Req #7: Return full recipe details by ID
 */
async function getRecipeDetails(recipe_id) {
    let recipe_info = await getRecipeInformation(recipe_id);
    let { id, title, readyInMinutes, image, aggregateLikes, vegan, vegetarian, glutenFree } = recipe_info.data;

    return {
        id: id,
        title: title,
        readyInMinutes: readyInMinutes,
        image: image,
        popularity: aggregateLikes,
        vegan: vegan,
        vegetarian: vegetarian,
        glutenFree: glutenFree,
        
    }
}

async function getRecipeInformation(recipe_id) {
    return await axios.get(`${api_domain}/${recipe_id}/information`, {
        params: {
            includeNutrition: false,
            apiKey: process.env.spooncular_apiKey
        }
    });
}


/**
 * Req #9: Add a new recipe created by user
 */
async function addRecipe(recipe) {
  if (added_recipes.find(r => r.id === recipe.id)) {
    throw { status: 409, message: "Recipe already exists" };
  }
    user_recipes[userId] = user_recipes[userId] || [];
    user_recipes[userId].push(recipe);
    return recipe;
}

//Requirement number 6: Mark a recipe as watched by the user (added to "watched" list)
async function markRecipeAsWatched(userId, recipeId)
{
    return { message: `Recipe ${recipeId} marked as watched for user ${userId}` };
}


/**
 * Req #10: Get all favorite recipes of a user
 */
async function getFavoriteRecipes(userId) {
}

/**
 * Req #10: Mark a recipe as favorite
 */
async function markRecipeAsFavorite(userId, recipeId) {
}


/**
 * Req #11: Return all recipes created by the user
 */
async function getUserRecipes(userId) {
}

/**
 * Req #12: Return family recipes for the user
 */
async function getFamilyRecipes(userId) {
}

/**
 * Req #12: Create a new family recipe
 */
async function createFamilyRecipe(recipe, userId) {
    // family_recipes[userId] = family_recipes[userId] || [];
    // family_recipes[userId].push(recipe);
    // return recipe;
}

/**
 * Bonus #13: Get preparation steps for a recipe
 */
async function getPreparationSteps(recipeId) {
    // Use Spoonacular analyzedInstructions API
}

/**
 * Bonus #13: Multiply ingredients based on servings
 */
async function doubleIngredients(recipeId, multiplier) {
    // Multiply each ingredient amount
}

/**
 * Bonus #14: Add recipe to the upcoming meal plan
 */
async function addToMealPlan(userId, recipeId) {
    // Add recipe to user's meal plan
}

/**
 * Bonus #14: Return the full meal plan
 */
async function getMealPlan(userId) {
    // Return list of recipes in meal plan
}

/**
 * Bonus #14: Update the meal order (reordering)
 */
async function updateMealOrder(userId, newOrderArray) {
    // Update order of meal plan recipes
}

/**
 * Bonus #14: Remove a recipe from the meal plan
 */
async function removeFromMealPlan(userId, recipeId) {
    // Remove recipe from meal plan
}

/**
 * Bonus #14: Clear entire meal plan
 */
async function clearMealPlan(userId) {
    // Clear all meal plan entries
}

/**
 * Bonus #14: Get meal progress (which steps are done)
 */
async function getMealProgress(userId, recipeId) {
    // Return progress array for recipe
}

/**
 * Bonus #14: Mark a specific step as done
 */
async function setStepAsDone(userId, recipeId, stepIndex) {
    // Mark step index as done in progress array
}



// exports.getRecipeDetails = getRecipeDetails;
// exports.getThreeRandomRecipes = getThreeRandomRecipes;
// exports.getRecipeDetailsByName = getRecipeDetailsByName;
// exports.addRecipe = addRecipe;


module.exports = {
    getThreeRandomRecipes,
    getThreeWatchedRecipes,
    markRecipeAsWatched,
    getRecipeDetailsByName,
    getRecipeDetails,
    addRecipe,
    getFavoriteRecipes,
    markRecipeAsFavorite,
    getUserRecipes,
    getFamilyRecipes,
    createFamilyRecipe,
    getPreparationSteps,
    doubleIngredients,
    addToMealPlan,
    getMealPlan,
    updateMealOrder,
    removeFromMealPlan,
    clearMealPlan,
    getMealProgress,
    setStepAsDone
};
