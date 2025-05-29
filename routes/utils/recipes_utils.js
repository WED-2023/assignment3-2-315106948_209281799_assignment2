const axios = require("axios");
const { param } = require("../user");
const api_domain = "https://api.spoonacular.com/recipes";
let added_recipes = [];



/**
 * Get recipes list from spooncular response and extract the relevant recipe data for preview
 * @param {*} recipes_info 
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

async function getRecipeInformation(recipe_id) {
    return await axios.get(`${api_domain}/${recipe_id}/information`, {
        params: {
            includeNutrition: false,
            apiKey: process.env.spooncular_apiKey
        }
    });
}

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

//returns the recipe details by recipe name
async function getRecipeDetailsByName(recipe_name,number=5) {
    let recipe_info = await axios.get(`${api_domain}/complexSearch`, {
        params: {
            query: recipe_name,
            number: number, // number of recipes to return
            apiKey: process.env.spooncular_apiKey
        }
    });
    if (recipe_info.data.length === 0) {
        throw { status: 404, message: "Recipe not found" };
    }
    return await getRecipeDetails(recipe_info.data[0].id);
}

// Added a new recipe to the list of added recipes
async function addRecipe(recipe) {
    
    if (!added_recipes.includes(recipe.id)) {
        added_recipes.push(recipe.id);
    }
    return recipe;
}

exports.getRecipeDetails = getRecipeDetails;
exports.getThreeRandomRecipes = getThreeRandomRecipes;
exports.getRecipeDetailsByName = getRecipeDetailsByName;
exports.addRecipe = addRecipe;


