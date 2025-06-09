// auth.js — routes for authentication (register, login, logout)
var express = require("express");
var router = express.Router();
const MySql = require("../routes/utils/MySql");
const DButils = require("../routes/utils/DButils");
const bcrypt = require("bcrypt");

/**
 * POST /Register
 * - Registers a new user
 * - Validates required fields
 * - Ensures username uniqueness
 * - Hashes password and inserts user into DB
 */
router.post("/Register", async (req, res, next) => {
  try {
    // parameters exists
    // valid parameters
    // username exists
    let user_details = {
      username: req.body.username,
      firstname: req.body.firstname,
      lastname: req.body.lastname,
      country: req.body.country,
      password: req.body.password,
      email: req.body.email,
      profilePic: req.body.profilePic
    }

    // 1) Check for missing required parameters
    if (
      !user_details.username ||
      !user_details.firstname ||
      !user_details.lastname ||
      !user_details.country ||
      !user_details.password ||
      !user_details.email
    ) {
      throw { status: 400, message: "Missing parameters" };
    }

    // 2) Verify username does not already exist
    let users = [];
    users = await DButils.execQuery("SELECT username from users");

    if (users.find((x) => x.username === user_details.username))
      throw { status: 409, message: "Username already exists" };

    // 3) Hash the password before storing
    let hash_password = bcrypt.hashSync(
      user_details.password,
      parseInt(process.env.bcrypt_saltRounds)
    );

    // 4) Insert new user into database
    await DButils.execQuery(
      `INSERT INTO users (username, firstname, lastname, country, password, email, profilePic) VALUES ('${user_details.username}', '${user_details.firstname}', '${user_details.lastname}',
      '${user_details.country}', '${hash_password}', '${user_details.email}', '${user_details.profilePic}')`
    );

    res.status(201).send({ message: "user created", success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /Login
 * - Authenticates an existing user
 * - Validates credentials
 * - Sets session cookie on success
 */
router.post("/Login", async (req, res, next) => {
  try {
    // parameters exists
    if (!req.body.username || !req.body.password) {
      throw { status: 400, message: "Missing parameters" };
    }
    // check that username exists
    const users = await DButils.execQuery("SELECT username FROM users");
    if (!users.find((x) => x.username === req.body.username))
      throw { status: 401, message: "Username or Password incorrect" };

    // check that the password is correct
    const user = (
      await DButils.execQuery(
        `SELECT * FROM users WHERE username = '${req.body.username}'`
      )
    )[0];

    if (!bcrypt.compareSync(req.body.password, user.password)) {
      throw { status: 401, message: "Username or Password incorrect" };
    }

    // Set cookie
    req.session.user_id = user.user_id;
    console.log("session user_id login: " + req.session.user_id);

    // return cookie
    res.status(200).send({ message: "login succeeded " , success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /Logout
 * - Logs out the current user by resetting session
 * - Returns 401 if no user is logged in
 */
router.post("/Logout", function (req, res) {
  // Check if the user is logged in
  if (!req.session || !req.session.user_id) {
    return res.status(401).send({ success: false, message: "Not logged in" });
  }
  console.log("session user_id Logout: " + req.session.user_id);
  req.session.reset(); // reset the session info --> send cookie when  req.session == undefined!!
  res.send({ success: true, message: "logout succeeded" });
});

module.exports = router;