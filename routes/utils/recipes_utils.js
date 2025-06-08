const axios = require("axios");
// const { param } = require("../user");
const DButils = require("../utils/DButils");
const api_domain = "https://api.spoonacular.com/recipes";
let added_recipes = [];

/**
 * Get recipes list from spooncular response and extract the relevant recipe data for preview
 * @param {*} recipes_info 
 */

async function addUserSessionInfo(user_id, recipe){
    // add fields of watched, favorite, and family to the recipe object
    recipe.watched = false;
    recipe.favorite = false;
    recipe.family = false;
    // add the fields to the recipe object
    if (!user_id){
        return recipe;
    }
    else{
        const query1 = `SELECT recipe_id FROM watched_recipes WHERE user_id = '${user_id}' AND recipe_id = '${recipe.id}';`;
        const result = await DButils.execQuery(query1);
        if (result.length > 0) {
            recipe.watched = true;
        }
        const query2 = `SELECT recipe_id FROM favorite_recipes WHERE user_id = '${user_id}' AND recipe_id = '${recipe.id}';`;
        const result2 = await DButils.execQuery(query2);
        if (result2.length > 0) {
            recipe.favorite = true;
        }
        const query3 = `SELECT recipe_id FROM family_recipes_info WHERE user_id = '${user_id}' AND recipe_id = '${recipe.id}';`;
        const result3 = await DButils.execQuery(query3);
        if (result3.length > 0) {
            recipe.family = true;
        }
        return recipe;
    }
}


async function getThreeRandomRecipes(user_id) {
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
    const recipes_list = [];

    for (const recipe of recipes) {
    const r = recipe.data.recipes[0];

    const {
        id,
        title,
        readyInMinutes,
        image,
        aggregateLikes,
        vegan,
        vegetarian,
        glutenFree,
        servings,
        instructions,
        extendedIngredients
    } = r;

    const ingredients = extendedIngredients.map(ing => ({
        id: ing.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        image: `https://spoonacular.com/cdn/ingredients_100x100/${ing.image}`
    }));

    const fullRecipe = {
        id,
        title,
        readyInMinutes,
        image,
        popularity: aggregateLikes,
        vegan,
        vegetarian,
        glutenFree,
        servings,
        instructions,
        ingredients
    };

    const enrichedRecipe = await addUserSessionInfo(user_id, fullRecipe);
    recipes_list.push(enrichedRecipe);
    }

    return recipes_list;
}

/**
 * Search recipes with optional filters (cuisine, diet, intolerances)
 * @param {string} recipe_name - search query
 * @param {number} number - number of results
 * @param {object} filters - optional filters { cuisine, diet, intolerances }
 * @returns {Array<Object>} - Array of recipe preview objects
 */
async function searchRecipesWithFilters(user_id, recipe_name, number = 5, filters = {}) {
    let { cuisine, diet, intolerances } = filters;
    const params = {
        query: recipe_name,
        number,
        apiKey: process.env.spooncular_apiKey
    };

    if (cuisine) params.cuisine = cuisine;
    if (diet) params.diet = diet;
    if (intolerances) params.intolerances = intolerances;
    
    let response = await axios.get(`${api_domain}/complexSearch`, {
        params
    });

    if (!response.data.results || response.data.results.length === 0) {
        throw { status: 404, message: "Recipe not found" };
    }
    const ids = response.data.results.map(r => r.id);
    return await getRecipesPreview(user_id, ids);
}


async function getRecipeDetails(user_id, recipe_id) {
  try {
    const recipe_info = await getRecipeInformation(recipe_id); // axios call

    const {
      id,
      title,
      readyInMinutes,
      image,
      aggregateLikes,
      vegan,
      vegetarian,
      glutenFree,
      servings,
      instructions,
      extendedIngredients
    } = recipe_info.data;

    const ingredients = extendedIngredients.map(ing => ({
      id: ing.id,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      original: ing.original,
      image: `https://spoonacular.com/cdn/ingredients_100x100/${ing.image}`
    }));

    const recipe = {
      id,
      title,
      readyInMinutes,
      image,
      popularity: aggregateLikes,
      vegan,
      vegetarian,
      glutenFree,
      servings,
      instructions,
      ingredients
    };

    const enrichedRecipe = await addUserSessionInfo(user_id, recipe);
    return enrichedRecipe;
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn(`Recipe with ID ${recipe_id} not found.`);
      return null;
    } else {
      throw error;
    }
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
async function addRecipe(recipe, user_id) {
  const {
    id,
    title,
    image,
    readyInMinutes,
    popularity,
    vegan,
    vegetarian,
    glutenFree
  } = recipe;

  const recipeQuery = `
    INSERT INTO recipes (
      id, title, image, readyInMinutes, popularity,
      vegan, vegetarian, glutenFree
    )
    VALUES (
      '${id}', '${title}', '${image}', ${readyInMinutes}, ${popularity},
      ${vegan}, ${vegetarian}, ${glutenFree}
    );
  `;

  const userRecipeQuery = `
    INSERT INTO user_recipes (user_id, recipe_id)
    VALUES (${user_id}, '${id}');
  `;

  await DButils.execQuery(recipeQuery);
  await DButils.execQuery(userRecipeQuery);
  return recipe;
}



/**
 Return all recipes created by the user
 */
async function getUserRecipes(user_id) {
    const query = `SELECT recipe_id FROM user_recipes WHERE user_id = '${user_id}';`;
    const result = await DButils.execQuery(query);
    return result.map(r => r.recipe_id);
}

/**
 Return family recipes for the user
 */
async function getFamilyRecipes(user_id) {
    const query = `SELECT f.recipe_id FROM family_recipes_info f JOIN user_recipes u ON f.recipe_id = u.recipe_id WHERE u.user_id = '${user_id}';`;
    const result = await DButils.execQuery(query);
    return result.map(r => r.recipe_id);
}

async function markAsWatched(user_id, recipe_id){
    const query = `
        INSERT INTO watched_recipes (user_id, recipe_id, watched_at)
        VALUES (${user_id}, '${recipe_id}', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE watched_at = CURRENT_TIMESTAMP;
    `;

    await DButils.execQuery(query);
    return { message: `Recipe ${recipe_id} marked as watched for user ${user_id}` };
}

/**
 * Create a new family recipe
 */
async function createFamilyRecipe(recipe, user_id) {
  const {
    id,
    title,
    image,
    readyInMinutes,
    popularity,
    vegan,
    vegetarian,
    glutenFree,
    origin_person,
    occasion,
    story
  } = recipe;

  // Step 1: Save base recipe data
  await addRecipe({
    id,
    title,
    image,
    readyInMinutes,
    popularity,
    vegan,
    vegetarian,
    glutenFree
  }, user_id);

  // Step 2: Save family-specific metadata
  const query = `
    INSERT INTO family_recipes_info (recipe_id, user_id, origin_person, occasion, story)
    VALUES ('${id}', ${user_id}, '${origin_person}', '${occasion}', '${story}');
  `;

  await DButils.execQuery(query);

  return {
    message: "Family recipe created successfully",
    recipe_id: id
  };
}


/**
 * Return preview details for multiple recipes
 * @param {Array<string>} recipe_id_array - Array of recipe IDs
 * @returns {Array<Object>} - Array of recipe preview objects
 */
async function getRecipesPreview(user_id, recipe_id_array) {
    const previewPromises = recipe_id_array.map(id => getRecipeDetails(user_id, id));
    const previews = await Promise.all(previewPromises);

    // Filter out any nulls (e.g. 404 or failed fetch)
    return previews.filter(recipe => recipe !== null);
}


/**
 * Bonus #13: Get preparation steps for a recipe
 */
async function getPreparationSteps(recipeId) {
  try {
    const response = await axios.get(
      `${api_domain}/${recipeId}/analyzedInstructions`,
      {
        params: {
          apiKey: process.env.spooncular_apiKey
        }
      }
    );

    const instructions = response.data;

    if (!instructions || instructions.length === 0 || !instructions[0].steps) {
      throw new Error("No preparation steps found for this recipe.");
    }

    return instructions[0].steps; // Array of { number, step, ingredients, equipment }
  } catch (error) {
    throw new Error("Failed to fetch preparation steps: " + error.message);
  }
}

/**
 * Bonus #13: Multiply ingredients based on servings
 */
async function doubleIngredients(recipeId, multiplier) {
    // Multiply each ingredient amount
}

/**
 * Bonus #14: 
 */
async function getMealPlan(userId) {
  const query = `
    SELECT recipe_id, order_index
    FROM meal_plan
    WHERE user_id = ${userId}
    ORDER BY order_index ASC;
  `;
  return await DButils.execQuery(query);
}

async function addToMealPlan(userId, recipeId) {
  const currentPlan = await getMealPlan(userId);
  const exists = currentPlan.find(r => r.recipe_id == recipeId);
  if (exists) return;

  const nextIndex = currentPlan.length + 1;
  await DButils.execQuery(`
    INSERT INTO meal_plan (user_id, recipe_id, order_index)
    VALUES (${userId}, '${recipeId}', ${nextIndex});
  `);
}

async function removeFromMealPlan(userId, recipeId) {
  await DButils.execQuery(`
    DELETE FROM meal_plan WHERE user_id = ${userId} AND recipe_id = '${recipeId}';
  `);
}

async function reorderMealPlan(userId, newOrderArray) {
  if (!newOrderArray || newOrderArray.length === 0) return;

  // Build CASE WHEN SQL block
  const cases = newOrderArray.map(({ recipeId, order }) => {
    return `WHEN recipe_id = '${recipeId}' THEN ${order}`;
  }).join("\n");

  // Build recipe ID list for WHERE clause
  const recipeIds = newOrderArray.map(({ recipeId }) => `'${recipeId}'`).join(", ");

  const query = `
    UPDATE meal_plan
    SET order_index = CASE
      ${cases}
    END
    WHERE user_id = ${userId} AND recipe_id IN (${recipeIds});
  `;

  await DButils.execQuery(query);
}

async function validateMealPlanOrder(userId, newOrderArray) {
  if (!Array.isArray(newOrderArray) || newOrderArray.length === 0) {
    throw new Error("Invalid input: newOrder must be a non-empty array");
  }

  // Check structure
  for (const item of newOrderArray) {
    if (
      !item.recipeId ||
      typeof item.recipeId !== "string" ||
      typeof item.order !== "number" ||
      item.order < 1
    ) {
      throw new Error("Invalid format: each item must have a valid recipeId and order >= 1");
    }
  }

  // Check for duplicates in recipeId or order
  const recipeIds = newOrderArray.map(i => i.recipeId);
  const orders = newOrderArray.map(i => i.order);

  const hasDuplicates = (arr) => new Set(arr).size !== arr.length;
  if (hasDuplicates(recipeIds)) {
    throw new Error("Duplicate recipeId detected in reorder list");
  }
  if (hasDuplicates(orders)) {
    throw new Error("Duplicate order value detected");
  }

  // Check all recipeIds exist in user's meal plan
  const currentPlan = await getMealPlan(userId); // returns [{ recipe_id, order_index }]
  const currentIds = currentPlan.map(r => r.recipe_id);

  const missingIds = recipeIds.filter(id => !currentIds.includes(id));
  if (missingIds.length > 0) {
    throw new Error(`Invalid recipeIds in reorder list: ${missingIds.join(", ")}`);
  }

  return true; // valid
}

async function clearMealPlan(userId) {
  await DButils.execQuery(`
    DELETE FROM meal_plan WHERE user_id = ${userId};
  `);
}



module.exports = {
    getThreeRandomRecipes,
    searchRecipesWithFilters,
    getRecipeDetails,
    addRecipe,
    getUserRecipes,
    getFamilyRecipes,
    createFamilyRecipe,
    getPreparationSteps,
    doubleIngredients,
    addToMealPlan,
    getMealPlan,
    reorderMealPlan,
    removeFromMealPlan,
    clearMealPlan,
    getRecipesPreview,
    markAsWatched,
    validateMealPlanOrder
};
