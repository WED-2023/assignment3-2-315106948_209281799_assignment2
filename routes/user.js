// user.js — routes for user-related recipe operations
var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");
const { v4: uuidv4 } = require('uuid');
const multer = require("multer");
const path = require("path");


// Middleware to handle file uploads
// This will save uploaded files to the "uploads" directory with a unique name
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); 
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({ storage });


/**
 * Middleware: Authenticate all requests
 * - Logs session data
 * - Verifies session.user_id exists in users table
 * - Attaches req.user_id on success or returns 401 Unauthorized
 */
router.use(async function (req, res, next) {
  if (req.session && req.session.user_id) {
    // Check if user_id exists in the database
    DButils.execQuery("SELECT user_id FROM users").then((users) => {
      if (users.find((x) => x.user_id === req.session.user_id)) {
        // User found: attach to request and continue
        req.user_id = req.session.user_id;
        console.log("User authenticated: " + req.user_id);
        next();
      }
    }).catch(err => next(err));
  } else {
    // No session or no user_id: unauthorized
    res.sendStatus(401);
  }
});


/**
 * POST /favorites
 * - Saves a recipe as a favorite for the logged-in user
 * - Validates recipeId in body
 * - Prevents duplicates
 * - Verifies existence in Spoonacular or user-created recipes
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

    // check if the recipe exists
    const recipeExists = await recipe_utils.getRecipeDetails(user_id, recipe_id);
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
 * GET /favorites
 * - Retrieves all favorite recipes for the logged-in user
 * - Returns an array of recipe preview objects
 */
router.get('/favorites', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    // Get all favorite recipe entries for the user
    const favorite_recipes = await user_utils.getFavoriteRecipes(user_id);

    // Extract recipe IDs into a plain array
    const recipes_id_array = favorite_recipes.map(recipe => recipe.recipe_id);
    
    // If no favorites, return empty array early
    if (recipes_id_array.length === 0) {
      return res.status(200).send([]);
    }

    const results = await recipe_utils.getRecipesPreview(user_id, recipes_id_array);
    res.status(200).send(results);
  } catch(error){
      next(error); 
    }
});

/**
 * POST /myRecipes
 * - Saves a new user-created recipe
 * - Requires only id and title (via validateRecipeData)
 * - Optionally persists ingredients and steps if provided
 */
// OLD: get recipe id from client
// router.post('/myRecipes', async (req, res, next) => {
//   try {
//     const user_id = req.session.user_id;
//     const recipe = req.body;

//     // throws if any preview field missing
//     recipe_utils.validateRecipeData(recipe);

//     // will save ingredients/steps only if provided
//     const newRecipe = await recipe_utils.addRecipe(recipe, user_id);
//     res.status(201).send(newRecipe);

//   } catch (error) {
//     // input errors → 400; database or other → next(error)
//     if (error.message.startsWith("Missing required")) {
//       return res.status(400).send(error.message);
//     }
//     next(error);
//   }
// });


// New: generate a new id for the recipe
router.post('/myRecipes', async (req, res, next) => {
  try {
    //console debuging 
    console.log("==> [DEBUG] Incoming /myRecipes request");
    console.log("Session user_id:", req.session.user_id);
    console.log("Raw body received:", req.body);

    const user_id = req.session.user_id;
    // Grab all fields except id from the client
    const recipe = { ...req.body };

    // 1) Generate the ID on the server
    recipe.id = uuidv4();
    console.log("Generated recipe ID:", recipe.id);


    // 2) Validate your preview fields (title, image, etc.)
    //    Make sure your validateRecipeData no longer expects recipe.id from the client.
    console.log("Validating recipe...");
    recipe_utils.validateRecipeData(recipe);
    console.log("Validation passed ✅");

    // 3) Persist recipe (ingredients + steps if present)
    console.log("Calling addRecipe...");
    const newRecipe = await recipe_utils.addRecipe(recipe, user_id);
    console.log("Recipe saved successfully:", newRecipe);
    
    // 4) Return the newly created recipe (including its server-generated ID)
    res.status(201).send(newRecipe);
  }
  catch (error) {
    console.error("❌ Error in /myRecipes:", error.message);
    console.error(error.stack);

    if (error.message.startsWith("Missing required")) {
      return res.status(400).send(error.message);
    }

    next(error);
  }
});



/**
 * GET /myRecipes
 * - Returns an array of recipe preview objects
 */
router.get('/myRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipes_id_array = await recipe_utils.getUserRecipes(user_id);  // returns only the ids
    const results = await recipe_utils.getRecipesPreview(user_id, recipes_id_array);
    res.status(200).send(results);
  } catch (error) {
    next(error);
  }
});

// post a recipe as family recipe
// OLD: get recipe id from client
// router.post('/familyRecipes', async (req, res, next) => {
//   try {
//     const user_id = req.session.user_id;
//     const recipe = req.body;
//     if (!recipe || !recipe.id || !recipe.title || !recipe.origin_person || !recipe.occasion || !recipe.story) {
//       return res.status(400).send("Invalid recipe data");
//     }
//     const newRecipe = await recipe_utils.createFamilyRecipe(recipe, user_id);
//     res.status(201).send(newRecipe);
//   } catch (error) {
//     next(error);
//   }
// });

// New: generate a new id for the recipe
// POST /familyRecipes — server generates the ID
router.post('/familyRecipes', async (req, res, next) => {
  try {
    console.log("Received family recipe:", req.body);
    const user_id = req.session.user_id;
    // Grab all fields except id
    const recipe = { ...req.body };

    // Validate required family fields
    if (!recipe.title || !recipe.origin_person || !recipe.occasion || !recipe.story) {
      console.log("Invalid recipe data:", recipe);
      return res.status(400).send("Invalid recipe data");
    }

    // 1) Generate ID here
    recipe.id = uuidv4();

    // 2) Create the family recipe record
    const newRecipe = await recipe_utils.createFamilyRecipe(recipe, user_id);

    // 3) Return the created record
    res.status(201).send(newRecipe);
  }
  catch (error) {
    next(error);
  }
});

// get all family recipes
router.get('/familyRecipes', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const family_recipes_id_array = await recipe_utils.getFamilyRecipes(user_id);
    const results = await recipe_utils.getRecipesPreview(user_id, family_recipes_id_array);

    res.status(200).send(results);
  } catch (error) {
    next(error);
  }
});


// Get the last three watched recipes for the current user
router.get('/watched', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    // Get all watched recipe entries for the user
    const watched_recipes = await user_utils.getThreeWatchedRecipes(user_id);

    // Extract recipe IDs into a plain array
    const recipes_id_array = watched_recipes.map(recipe => recipe.recipe_id);
    
    // If no favorites, return empty array early
    if (recipes_id_array.length === 0) {
      return res.status(200).send([]);
    }

    const results = await recipe_utils.getRecipesPreview(user_id, recipes_id_array);
    res.status(200).send(results);
  } catch(error){
    next(error); 
  }
});


module.exports = router;
