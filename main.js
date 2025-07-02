require("dotenv").config();
//#region express configures
const  express = require("express");
const  path = require("path");
const  logger = require("morgan");
const session = require("client-sessions");
const DButils = require("./routes/utils/DButils");
const cors = require("cors");

var app = express();
app.use(cors({
  origin: ["http://localhost:80", "http://localhost:8082", "http://localhost:8080"],
  credentials: true
}));
app.use(logger("dev")); //logger
app.use(express.json()); // parse application/json
app.use(
  session({
    cookieName: "session", // the cookie key name
    //secret: process.env.COOKIE_SECRET, // the encryption key
    secret: "template", // the encryption key
    duration: 24 * 60 * 60 * 1000, // expired after 20 sec
    activeDuration: 1000 * 60 * 5, // if expiresIn < activeDuration,
    cookie: {
      httpOnly: false,
    }
    //the session will be extended by activeDuration milliseconds
  })
);
app.use(express.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(express.static(path.join(__dirname, "public"))); //To serve static files such as images, CSS files, and JavaScript files
//local:
app.use(express.static(path.join(__dirname, "dist")));
// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//remote:
// app.use(express.static(path.join(__dirname, '../assignment-3-3-frontend/dist')));

app.get("/",function(req,res)
{ 
  res.sendFile(__dirname+"/index.html");
});


// var port = process.env.PORT || "3000"; //local=3000 remote=80
var port = "3000"
//#endregion
const user = require("./routes/user");
const recipes = require("./routes/recipes");
const auth = require("./routes/auth");


//#region cookie middleware
app.use(function (req, res, next) {
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT user_id FROM users")
      .then((users) => {
        if (users.find((x) => x.user_id === req.session.user_id)) {
          req.user_id = req.session.user_id;
        }
        next();
      })
      .catch((error) => next());
  } else {
    next();
  }
});
//#endregion

// ----> For cheking that our server is alive
app.get("/alive", (req, res) => res.send("I'm alive"));

// Routings
app.use("/user", user);
app.use("/recipes", recipes);
app.use("/", auth);


// Default router
app.use(function (err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).send({ message: err.message, success: false });
});


const server = app.listen(port, () => {
  console.log(`Server listen on port ${port}`);
});

process.on("SIGINT", function () {
  if (server) {
    server.close(() => console.log("server closed"));
  }
  process.exit();
});
