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
    // thirdRecipe = axios.get(`${api_domain}/random`, {
    //     params: {
    //     apiKey: process.env.spooncular_apiKey
    //     }
    // });
    // let recipes = await Promise.all([firstRecipe, secondRecipe, thirdRecipe]);
    let recipes = await Promise.all([firstRecipe, secondRecipe]);
    let recipes_list = [];
    
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

/**
 * Fetch full recipe details:
 *  1) Try Spoonacular API
 *  2) If 404 *and* user_id is provided, fall back to local DB’s user-created recipes
 */
async function getRecipeDetails(user_id, recipe_id) {
  try {
    // 1) Fetch full payload from Spoonacular
    const { data } = await getRecipeInformation(recipe_id);

    // 2) Build ingredients[] exactly as before
    const ingredients = (data.extendedIngredients || []).map(ing => ({
      id:       ing.id,
      name:     ing.name,
      amount:   ing.amount,
      unit:     ing.unit,
      original: ing.original,
      image:    `https://spoonacular.com/cdn/ingredients_100x100/${ing.image}`
    }));

    // 3) Normalize steps[] from analyzedInstructions or fallback HTML
    let steps = [];
    if (Array.isArray(data.analyzedInstructions) && data.analyzedInstructions.length) {
      steps = data.analyzedInstructions[0].steps.map(s => ({
        number: s.number,
        step:   s.step
      }));
    } else if (data.instructions) {
      const liMatches = Array.from(
        data.instructions.matchAll(/<li>(.*?)<\/li>/gi)
      );
      steps = liMatches.map((m,i) => ({
        number: i + 1,
        step:   m[1].trim()
      }));
    }
    
    // 4) Spread in *all* the fields Spoonacular gave us...
    const recipe = {
      ...data,
      ingredients,
      steps
    };

  
    // Enrich with watched/favorite/family flags
    result = await addUserSessionInfo(user_id, recipe);
    return result;

  } catch (error) {
    // 2) attempt local DB fallback
    if (user_id) {
      // Check user-created recipes table
      const rows = await DButils.execQuery(
        `SELECT * FROM recipes WHERE id='${recipe_id}'`
      );
      if (rows.length === 0) return null;

      const row = rows[0];
      // Load persisted ingredients (if any)
      const ingRows = await DButils.execQuery(
        `SELECT ingredient_id AS id, name, amount, unit, original, image
           FROM ingredients
          WHERE recipe_id='${recipe_id}'
          ORDER BY ingredient_id`
      );
      const ingredients = ingRows.map(r => ({
        id:       r.id,
        name:     r.name,
        amount:   r.amount,
        unit:     r.unit,
        original: r.original,
        image:    r.image
      }));

      // Load persisted steps (if any)
      const stepRows = await DButils.execQuery(
        `SELECT step_index, instruction
           FROM instructions
          WHERE recipe_id='${recipe_id}'
          ORDER BY step_index`
      );
      const steps = stepRows.map(r => ({
        number: r.step_index,
        step:   r.instruction
      }));

      // Build full local recipe object
      let recipe = {
        id:             row.id,
        title:          row.title,
        readyInMinutes: row.readyInMinutes,
        image:          row.image,
        popularity:     row.popularity,
        vegan:          !!row.vegan,
        vegetarian:     !!row.vegetarian,
        glutenFree:     !!row.glutenFree,
        servings:       row.servings,
        ingredients,                          // from ingredients table
        steps,                                 // from instructions table
        instructions: steps.map(s => `${s.number}. ${s.step}`).join("<br/>") // synthesize the blob from steps
      };

      // Enrich with watched/favorite/family flags
      recipe = await addUserSessionInfo(user_id, recipe);
      return recipe;
    }

    // Re-throw other errors
    throw error;
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
 * — HELPER: validate that we at least have all preview fields —
 * Only these are required; ingredients/steps are optional.
 */
function validateRecipeData(recipe) {
  const required = [
    'id', 'title'
  ];
  for (const f of required) {
    if (recipe[f] === undefined || recipe[f] === null) {
      throw new Error(`Missing required field: ${f}`);
    }
  }
}

function escapeSQL(val) {
  if (typeof val !== "string") return val;
  return val.replace(/'/g, "''");
}

/**
 * Insert or update a recipe + its optional ingredients & steps, and link it to the user.
 */
// OLD:
// async function addRecipe(recipe, user_id) {
//   // 1) ensure preview fields
//   validateRecipeData(recipe);
//   const {
//     id,
//     title,
//     image          = null,
//     readyInMinutes = null,
//     servings       = null,
//     popularity     = 0,
//     vegan          = false,
//     vegetarian     = false,
//     glutenFree     = false
//   } = recipe;

//   // 2) upsert into recipes
//   // escape any apostrophes
//   const safeId     = escapeSQL(id);
//   const safeTitle  = escapeSQL(title);
//   const safeImage  = image ? escapeSQL(image) : null;

//   const recipeQuery = `
//     INSERT INTO recipes
//       (id, title, image, readyInMinutes, servings, popularity,
//        vegan, vegetarian, glutenFree)
//     VALUES
//       ('${safeId}', '${safeTitle}',
//        ${safeImage  ? `'${safeImage}'`  : 'NULL'},
//        ${readyInMinutes}, ${servings},
//        ${popularity}, ${vegan}, ${vegetarian}, ${glutenFree}
//       )
//     ON DUPLICATE KEY UPDATE
//       title          = VALUES(title),
//       image          = VALUES(image),
//       readyInMinutes = VALUES(readyInMinutes),
//       servings       = VALUES(servings),
//       popularity     = VALUES(popularity),
//       vegan          = VALUES(vegan),
//       vegetarian     = VALUES(vegetarian),
//       glutenFree     = VALUES(glutenFree);
//   `;
//   await DButils.execQuery(recipeQuery);

//   // 3) upsert ingredients if provided
//   if (Array.isArray(recipe.ingredients)) {
//     // clear old
//     await DButils.execQuery(`DELETE FROM ingredients WHERE recipe_id='${id}';`);
//     // insert new batch
//     for (const ing of recipe.ingredients) {
//       const {
//         id: ingId = null,
//         name,
//         amount,
//         unit = '',
//         original = null,
//         image: ingImage = null
//       } = ing;
//       const q = `
//         INSERT INTO ingredients
//           (recipe_id, ingredient_id, name, amount, unit, original, image)
//         VALUES
//           ('${id}', ${ingId}, '${name}', ${amount},
//            '${unit}', ${original ? `'${original}'` : 'NULL'},
//            ${ingImage  ? `'${ingImage}'`  : 'NULL'});
//       `;
//       await DButils.execQuery(q);
//     }
//   }

//   // 4) upsert steps if provided
//   if (Array.isArray(recipe.steps)) {
//     await DButils.execQuery(`DELETE FROM instructions WHERE recipe_id='${id}';`);
//     for (let idx = 0; idx < recipe.steps.length; idx++) {
//       const stepObj = recipe.steps[idx];
//       const text = stepObj.step ?? stepObj.instruction ?? '';
//       const q = `
//         INSERT INTO instructions
//           (recipe_id, step_index, instruction)
//         VALUES
//           ('${id}', ${idx + 1}, '${text}');
//       `;
//       await DButils.execQuery(q);
//     }
//   }

//   // 5) link to user_recipes (no-op if already exists)
//   const linkQ = `
//     INSERT INTO user_recipes (user_id, recipe_id)
//     VALUES (${user_id}, '${id}')
//     ON DUPLICATE KEY UPDATE recipe_id = recipe_id;
//   `;
//   await DButils.execQuery(linkQ);

//   return recipe;
// }
// NEW: more fields
/**
 * Insert or update a recipe (all columns) + ingredients, steps, and link to user
 */
async function addRecipe(recipe, user_id) {
  // 1) validate preview fields
  validateRecipeData(recipe);

  // 2) pull out everything; note we now grab `instructions` (string[]) and `steps` (object[])
  const {
    id,
    title,
    image                     = null,
    readyInMinutes            = null,
    servings                  = null,
    popularity                = 0,
    vegan                     = false,
    vegetarian                = false,
    glutenFree                = false,
    dairyFree                 = false,
    veryHealthy               = false,
    cheap                     = false,
    veryPopular               = false,
    sustainable               = false,
    lowFodmap                 = false,
    weightWatcherSmartPoints  = null,
    gaps                      = null,
    healthScore               = null,
    pricePerServing           = null,
    sourceUrl                 = null,
    spoonacularSourceUrl      = null,
    sourceName                = null,
    license                   = null,
    summary                   = null,
    ingredients               = [],
    instructions              = [],    // <-- plain-text array
    steps                     = []     // <-- optional step objects
  } = recipe;

  // decide which to use for inserting into instructions table:
  const finalSteps = Array.isArray(steps) && steps.length > 0
    ? steps
    : Array.isArray(instructions)
      ? instructions.map(text => ({ step: text }))
      : [];

  // helper to NULL or quoted string
  const safe = v => v === null ? 'NULL' : `'${escapeSQL(v)}'`;

  // 3) upsert into recipes (omitting any instructions column)
  const recipesQ = `
    INSERT INTO recipes
      (id, title, image, readyInMinutes, servings, popularity,
       vegan, vegetarian, glutenFree, dairyFree, veryHealthy,
       cheap, veryPopular, sustainable, lowFodmap,
       weightWatcherSmartPoints, gaps, healthScore,
       pricePerServing, sourceUrl, spoonacularSourceUrl,
       sourceName, license, summary)
    VALUES
      ('${escapeSQL(id)}', '${escapeSQL(title)}',
       ${safe(image)}, ${readyInMinutes}, ${servings}, ${popularity},
       ${vegan}, ${vegetarian}, ${glutenFree}, ${dairyFree},
       ${veryHealthy}, ${cheap}, ${veryPopular}, ${sustainable},
       ${lowFodmap}, ${weightWatcherSmartPoints}, ${safe(gaps)},
       ${healthScore}, ${pricePerServing}, ${safe(sourceUrl)},
       ${safe(spoonacularSourceUrl)}, ${safe(sourceName)},
       ${safe(license)}, ${safe(summary)})
    ON DUPLICATE KEY UPDATE
      title               = VALUES(title),
      image               = VALUES(image),
      readyInMinutes      = VALUES(readyInMinutes),
      servings            = VALUES(servings),
      popularity          = VALUES(popularity),
      vegan               = VALUES(vegan),
      vegetarian          = VALUES(vegetarian),
      glutenFree          = VALUES(glutenFree),
      dairyFree           = VALUES(dairyFree),
      veryHealthy         = VALUES(veryHealthy),
      cheap               = VALUES(cheap),
      veryPopular         = VALUES(veryPopular),
      sustainable         = VALUES(sustainable),
      lowFodmap           = VALUES(lowFodmap),
      weightWatcherSmartPoints = VALUES(weightWatcherSmartPoints),
      gaps                = VALUES(gaps),
      healthScore         = VALUES(healthScore),
      pricePerServing     = VALUES(pricePerServing),
      sourceUrl           = VALUES(sourceUrl),
      spoonacularSourceUrl= VALUES(spoonacularSourceUrl),
      sourceName          = VALUES(sourceName),
      license             = VALUES(license),
      summary             = VALUES(summary);
  `;
  await DButils.execQuery(recipesQ);

  // 4) replace ingredients
  await DButils.execQuery(
    `DELETE FROM ingredients WHERE recipe_id='${escapeSQL(id)}';`
  );
  for (let idx = 0; idx < ingredients.length; idx++) {
    const ing = ingredients[idx];
    const ingId = idx + 1;
    const {
      name,
      amount,
      unit          = '',
      original      = null,
      image: img    = null
    } = ing;
    const q = `
      INSERT INTO ingredients
        (recipe_id, ingredient_id, name, amount, unit, original, image)
      VALUES
        ('${escapeSQL(id)}', ${ingId}, '${escapeSQL(name)}',
         ${amount}, '${escapeSQL(unit)}',
         ${original ? `'${escapeSQL(original)}'` : 'NULL'},
         ${img      ? `'${escapeSQL(img)}'`      : 'NULL'});
    `;
    await DButils.execQuery(q);
  }

  // 5) replace instructions (from finalSteps)
  await DButils.execQuery(
    `DELETE FROM instructions WHERE recipe_id='${escapeSQL(id)}';`
  );
  for (let i = 0; i < finalSteps.length; i++) {
    const text = finalSteps[i].step ?? '';
    const q = `
      INSERT INTO instructions
        (recipe_id, step_index, instruction)
      VALUES
        ('${escapeSQL(id)}', ${i + 1}, '${escapeSQL(text)}');
    `;
    await DButils.execQuery(q);
  }

  // 6) link into user_recipes
  const linkQ = `
    INSERT INTO user_recipes (user_id, recipe_id)
    VALUES (${user_id}, '${escapeSQL(id)}')
    ON DUPLICATE KEY UPDATE recipe_id = recipe_id;
  `;
  await DButils.execQuery(linkQ);

  // return minimal preview back to client
  return { id, title, image, readyInMinutes, servings, popularity,
           vegan, vegetarian, glutenFree };
}
// async function addRecipe(recipe, user_id) {
//   // 1) ensure preview fields
//   validateRecipeData(recipe);

//   const {
//     id,
//     title,
//     image                     = null,
//     readyInMinutes            = null,
//     servings                  = null,
//     popularity                = 0,
//     vegan                     = false,
//     vegetarian                = false,
//     glutenFree                = false,
//     dairyFree                 = false,
//     veryHealthy               = false,
//     cheap                     = false,
//     veryPopular               = false,
//     sustainable               = false,
//     lowFodmap                 = false,
//     weightWatcherSmartPoints  = null,
//     gaps                      = null,
//     healthScore               = null,
//     pricePerServing           = null,
//     sourceUrl                 = null,
//     spoonacularSourceUrl      = null,
//     sourceName                = null,
//     license                   = null,
//     summary                   = null,
//     instructions              = null,
//     ingredients,
//     steps
//   } = recipe;

//   // helper to quote or NULL‐ify
//   const safe = v => v === null ? 'NULL' : `'${escapeSQL(v)}'`;

//   // 2) upsert into recipes (all your columns)
//   const recipeQuery = `
//     INSERT INTO recipes
//       (id, title, image, readyInMinutes, servings, popularity,
//        vegan, vegetarian, glutenFree, dairyFree, veryHealthy,
//        cheap, veryPopular, sustainable, lowFodmap,
//        weightWatcherSmartPoints, gaps, healthScore,
//        pricePerServing, sourceUrl, spoonacularSourceUrl,
//        sourceName, license, summary, instructions)
//     VALUES
//       ('${escapeSQL(id)}', '${escapeSQL(title)}',
//        ${safe(image)}, ${readyInMinutes}, ${servings}, ${popularity},
//        ${vegan}, ${vegetarian}, ${glutenFree}, ${dairyFree},
//        ${veryHealthy}, ${cheap}, ${veryPopular}, ${sustainable},
//        ${lowFodmap}, ${weightWatcherSmartPoints}, ${safe(gaps)},
//        ${healthScore}, ${pricePerServing}, ${safe(sourceUrl)},
//        ${safe(spoonacularSourceUrl)}, ${safe(sourceName)},
//        ${safe(license)}, ${safe(summary)}, ${safe(instructions)})
//     ON DUPLICATE KEY UPDATE
//       title                    = VALUES(title),
//       image                    = VALUES(image),
//       readyInMinutes           = VALUES(readyInMinutes),
//       servings                 = VALUES(servings),
//       popularity               = VALUES(popularity),
//       vegan                    = VALUES(vegan),
//       vegetarian               = VALUES(vegetarian),
//       glutenFree               = VALUES(glutenFree),
//       dairyFree                = VALUES(dairyFree),
//       veryHealthy              = VALUES(veryHealthy),
//       cheap                    = VALUES(cheap),
//       veryPopular              = VALUES(veryPopular),
//       sustainable              = VALUES(sustainable),
//       lowFodmap                = VALUES(lowFodmap),
//       weightWatcherSmartPoints = VALUES(weightWatcherSmartPoints),
//       gaps                     = VALUES(gaps),
//       healthScore              = VALUES(healthScore),
//       pricePerServing          = VALUES(pricePerServing),
//       sourceUrl                = VALUES(sourceUrl),
//       spoonacularSourceUrl     = VALUES(spoonacularSourceUrl),
//       sourceName               = VALUES(sourceName),
//       license                  = VALUES(license),
//       summary                  = VALUES(summary),
//       instructions             = VALUES(instructions);
//   `;
//   await DButils.execQuery(recipeQuery);

//   // 3) upsert ingredients if provided
//   if (Array.isArray(ingredients)) {
//     await DButils.execQuery(`DELETE FROM ingredients WHERE recipe_id='${escapeSQL(id)}';`);
//     for (const ing of ingredients) {
//       const {
//         id: ingId     = null,
//         name,
//         amount,
//         unit          = '',
//         original      = null,
//         image: img    = null
//       } = ing;
//       const q = `
//         INSERT INTO ingredients
//           (recipe_id, ingredient_id, name, amount, unit, original, image)
//         VALUES
//           ('${escapeSQL(id)}', ${ingId}, '${escapeSQL(name)}',
//            ${amount}, '${escapeSQL(unit)}',
//            ${original? `'${escapeSQL(original)}'` : 'NULL'},
//            ${img?      `'${escapeSQL(img)}'`      : 'NULL'});
//       `;
//       await DButils.execQuery(q);
//     }
//   }

//   // 4) upsert steps if provided
//   if (Array.isArray(steps)) {
//     await DButils.execQuery(`DELETE FROM instructions WHERE recipe_id='${escapeSQL(id)}';`);
//     for (let idx = 0; idx < steps.length; idx++) {
//       const text = steps[idx].step ?? steps[idx].instruction ?? '';
//       const q = `
//         INSERT INTO instructions
//           (recipe_id, step_index, instruction)
//         VALUES
//           ('${escapeSQL(id)}', ${idx+1}, '${escapeSQL(text)}');
//       `;
//       await DButils.execQuery(q);
//     }
//   }

//   // 5) link to user_recipes (now inlined—no ? placeholders)
//   const linkQ = `
//     INSERT INTO user_recipes (user_id, recipe_id)
//     VALUES (${user_id}, '${escapeSQL(id)}')
//     ON DUPLICATE KEY UPDATE recipe_id = recipe_id;
//   `;
//   await DButils.execQuery(linkQ);

//   return recipe;
// }


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
  // 1) Generate an ID if one wasn’t provided
  if (!recipe.id) {
    recipe.id = uuidv4();
  }

  // 2) Call addRecipe with the full payload so all fields persist
  //    addRecipe will write into recipes, ingredients, and instructions tables
  await addRecipe({
    id:                     recipe.id,
    title:                  recipe.title,
    image:                  recipe.image,
    readyInMinutes:         recipe.readyInMinutes,
    servings:               recipe.servings,
    popularity:             recipe.popularity,
    vegan:                  recipe.vegan,
    vegetarian:             recipe.vegetarian,
    glutenFree:             recipe.glutenFree,
    dairyFree:              recipe.dairyFree,
    veryHealthy:            recipe.veryHealthy,
    cheap:                  recipe.cheap,
    veryPopular:            recipe.veryPopular,
    sustainable:            recipe.sustainable,
    lowFodmap:              recipe.lowFodmap,
    weightWatcherSmartPoints: recipe.weightWatcherSmartPoints,
    gaps:                   recipe.gaps,
    healthScore:            recipe.healthScore,
    pricePerServing:        recipe.pricePerServing,
    sourceUrl:              recipe.sourceUrl,
    spoonacularSourceUrl:   recipe.spoonacularSourceUrl,
    sourceName:             recipe.sourceName,
    license:                recipe.license,
    summary:                recipe.summary,
    // full instructions text (if you store blob of all steps)
    instructions:           recipe.instructions,
    // arrays of objects for detailed tables:
    ingredients:            recipe.ingredients || [],
    steps:                  recipe.steps       || [],

    // family‐only fields get passed through too:
    origin_person:          recipe.origin_person,
    occasion:               recipe.occasion,
    story:                  recipe.story
  }, user_id);

  // 3) Persist the family‐only metadata
  const metaQ = `
    INSERT INTO family_recipes_info
      (recipe_id, user_id, origin_person, occasion, story)
    VALUES
      ('${recipe.id}', ${user_id},
       '${recipe.origin_person.replace(/'/g, "''")}',
       '${recipe.occasion.replace(/'/g, "''")}',
       '${recipe.story.replace(/'/g, "''")}')
    ON DUPLICATE KEY UPDATE
      origin_person = VALUES(origin_person),
      occasion      = VALUES(occasion),
      story         = VALUES(story);
  `;
  await DButils.execQuery(metaQ);

  // 4) Return the full recipe ID so the front end can redirect or fetch it
  return { recipe_id: recipe.id };
}
// async function createFamilyRecipe(recipe, user_id) {
//   const {
//     id,
//     title,
//     image,
//     readyInMinutes,
//     popularity,
//     vegan,
//     vegetarian,
//     glutenFree,
//     origin_person,
//     occasion,
//     story
//   } = recipe;

//   // Step 1: Save base recipe data
//   await addRecipe({
//     id,
//     title,
//     image,
//     readyInMinutes,
//     popularity,
//     vegan,
//     vegetarian,
//     glutenFree
//   }, user_id);

//   // Step 2: Save family-specific metadata
//   const query = `
//     INSERT INTO family_recipes_info (recipe_id, user_id, origin_person, occasion, story)
//     VALUES ('${id}', ${user_id}, '${origin_person}', '${occasion}', '${story}');
//   `;

//   await DButils.execQuery(query);

//   return {
//     message: "Family recipe created successfully",
//     recipe_id: id
//   };
// }


/**
 * Return preview details for multiple recipes.
 * Only the “preview” fields are returned:
 *   id, title, readyInMinutes, image, popularity,
 *   vegan, vegetarian, glutenFree,
 *   watched, favorite, family
 *
 * @param {string|null} user_id
 * @param {string[]} recipe_id_array
 * @returns {Promise<Object[]>}
 */
async function getRecipesPreview(user_id, recipe_id_array) {
  // 1. Fetch full details (with flags) for each ID
  const detailed = await Promise.all(
    recipe_id_array.map(id => getRecipeDetails(user_id, id))
  );

  // 2. Filter out any nulls (not found) and pluck only the preview fields
  return detailed
    .filter(r => r !== null)
    .map(r => ({
      id:             r.id,
      title:          r.title,
      readyInMinutes: r.readyInMinutes,
      image:          r.image,
      popularity:     r.popularity,
      vegan:          r.vegan,
      vegetarian:     r.vegetarian,
      glutenFree:     r.glutenFree,
      watched:        r.watched,
      favorite:       r.favorite,
      family:         r.family
    }));
}

/**
 * Bonus #13: Get preparation steps for a recipe
 */
/**
 * Bonus #13: Get preparation steps for a recipe
 *  - First tries Spoonacular
 *  - If no steps or an error, falls back to local DB’s instructions table
 */
async function getPreparationSteps(recipeId) {
  // 1) Try Spoonacular
  try {
    const response = await axios.get(
      `${api_domain}/${recipeId}/analyzedInstructions`,
      {
        params: { apiKey: process.env.spooncular_apiKey }
      }
    );
    const instructions = response.data;
    if (instructions?.length > 0 && instructions[0].steps?.length > 0) {
      return instructions[0].steps; // { number, step, ingredients, equipment }
    }
    // otherwise, fall through
  } catch (e) {
    console.warn(`Spoonacular steps failed for ${recipeId}:`, e.message);
  }

  // 2) Fallback: load from local instructions table
  //    (we must inline the recipeId since execQuery doesn't bind placeholders)
  const safeId = recipeId.replace(/'/g, "''");
  const rows = await DButils.execQuery(`
    SELECT step_index, instruction
      FROM instructions
     WHERE recipe_id = '${safeId}'
     ORDER BY step_index;
  `);

  return rows.map(r => ({
    number:      r.step_index,
    step:        r.instruction,
    ingredients: [],  // leave empty
    equipment:   []   // leave empty
  }));
}
// async function getPreparationSteps(recipeId) {
//   try {
//     const response = await axios.get(
//       `${api_domain}/${recipeId}/analyzedInstructions`,
//       {
//         params: {
//           apiKey: process.env.spooncular_apiKey
//         }
//       }
//     );

//     const instructions = response.data;

//     if (!instructions || instructions.length === 0 || !instructions[0].steps) {
//       throw new Error("No preparation steps found for this recipe.");
//     }

//     return instructions[0].steps; // Array of { number, step, ingredients, equipment }
//   } catch (error) {
//     throw new Error("Failed to fetch preparation steps: " + error.message);
//   }
// }

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
    validateMealPlanOrder,
    validateRecipeData
};
