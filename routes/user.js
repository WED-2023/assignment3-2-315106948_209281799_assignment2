var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");

/**
 * Authenticate all incoming requests by middleware
 */
router.use(async function (req, res, next) {
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT username FROM users").then((users) => {
      if (users.find((x) => x.user_id === req.session.user_id)) {
        req.user_id = req.session.user_id;
        next();
      }
    }).catch(err => next(err));
  } else {
    res.sendStatus(401);
  }
});


/**
 * This path gets body with recipeId and save this recipe in the favorites list of the logged-in user
 */
router.post('/favorites', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    const recipe_id = req.body.recipeId;
    // Validate that recipe_id is provided
    if (!recipe_id) {
      return res.status(400).send("Recipe ID is required");
    }
    // Check if the recipe already exists in favorites
    const existingFavorites = await user_utils.getFavoriteRecipes(user_id);
    if (existingFavorites.some(fav => fav.recipe_id === recipe_id)) {
      return res.status(200).send("Recipe is already in favorites");
    }
    // check if the recipe exists in the spoonacular api
    const recipeExists = await recipe_utils.getRecipeDetails(recipe_id);
    if (!recipeExists) {
      return res.status(404).send("Recipe not found");
    }
    await user_utils.markAsFavorite(user_id,recipe_id);
    res.status(200).send("The Recipe successfully saved as favorite");
    } catch(error){
    next(error);
  }
})

/**
 * This path returns the favorites recipes that were saved by the logged-in user
 */
router.get('/favorites', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    let favorite_recipes = {};
    const recipes_id = await user_utils.getFavoriteRecipes(user_id);
    let recipes_id_array = [];
    recipes_id.map((element) => recipes_id_array.push(element.recipe_id)); //extracting the recipe ids into array
    const results = await recipe_utils.getRecipesPreview(recipes_id_array);
    res.status(200).send(results);
  } catch(error){
    next(error); 
  }
});


// add a new recipes to the database (My recipes for the user)
router.post('/myRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipe = req.body;
    if (!recipe || !recipe.id || !recipe.title || !recipe.readyInMinutes || !recipe.image || !recipe.popularity || recipe.vegan === undefined || recipe.vegetarian === undefined || recipe.glutenFree === undefined) {
      return res.status(400).send("Invalid recipe data");
    }
    const newRecipe = await recipe_utils.addRecipe(recipe, user_id);
    res.status(201).send(newRecipe);
  } catch (error) {
    next(error);
  }
});

// get all recipes created by the user
router.get('/myRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipes = await recipe_utils.getUserRecipes(user_id);
    res.status(200).send(recipes);
  } catch (error) {
    next(error);
  }
});

// post a recipe as family recipe
router.post('/familyRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipe = req.body;
    if (!recipe || !recipe.id || !recipe.origin_person || !recipe.occasion || !recipe.story) {
      return res.status(400).send("Invalid recipe data");
    }
    const newRecipe = await recipe_utils.createFamilyRecipe(recipe, user_id);
    res.status(201).send(newRecipe);
  } catch (error) {
    next(error);
  }
});

// get all family recipes
router.get('/familyRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const familyRecipes = await recipe_utils.getFamilyRecipes(user_id);
    res.status(200).send(familyRecipes);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
