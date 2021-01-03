//jshint esversion:6
require("dotenv").config();
const async = require('async');
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const encrypt = require("mongoose-encryption");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const _ = require("lodash");
const date = require(__dirname + "/date.js");
const app = express();
const secret = process.env.SECRET;
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://" + process.env.DB_HOST + ":27017/budgetDB", {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
  username: String,
  password: String
});
userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const itemsSchema = new mongoose.Schema({
  name: String,
  cost: Number,
  type: String,
  day: Number,
  month: Number,
  year: Number,
  user: String
});
const listSchema = {
  name: String,
  items: [itemsSchema]
};
const Item = mongoose.model("Item", itemsSchema);
const workItems = [];

app.get("/home", function(req, res) {
  res.render("home");
});

app.get("/login", function(req, res) {
  res.render("login");
});

app.get("/register", function(req, res) {
  res.render("register");
});

app.get("/logout", function(req, res) {
  current_user = "";
  req.logout();
  res.redirect("/home");
});

var current_user = "";
var month = date.getMonth();
var year = date.getYear();
var month_year = date.getMonthYear();
app.get("/", function(req, res) {
  if (!req.isAuthenticated()) {
    res.redirect("/home");
  }
  var list_summary = [];
  var grouped_totals = [];
  var month_total = [];
  var queries = [];
  const day = date.getDate();
  // Get list of expenses this month
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$project": { "name":1, "type":1, "day": 1, "month": 1, "year": 1, "cost": { $divide: [ "$cost", 100 ] } } } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          list_summary[i] = items[i];
        }
      }
      cb(null, list_summary);
    });
  });
  // Get grouped monthly costs 
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$group": { "_id": { "type": "$type" }, "cost": { "$sum": '$cost' } } }, { "$project": { "cost": { $divide: [ "$cost", 100 ] } } } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          grouped_totals[i] = items[i];
        }
      }
      cb(null, grouped_totals);
    });
  });
  // Get overall monthly cost
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$group": { "_id": null, "cost": { "$sum": '$cost' } } }, { "$project": { "cost": { $divide: [ "$cost", 100 ] } } } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          month_total[i] = items[i];
        }
      }
      cb(null, month_total);
    });
  });

  async.parallel(queries, function(err, docs) {
    if (err) {
        throw err;
    }
    res.render("list", {
      currentUser: current_user,
      listTitle: day,
      newListItems: docs[0],
      monthlyTotalsTitle: month_year,
      monthlyTotals: docs[2],
      groupedTotals: docs[1]
    });
  })
});

app.post("/", function(req, res){
  const day = date.getDate();
  const listTitle = req.body.list;
  const item = new Item({
    name: req.body.newItem,
    cost: req.body.itemCost * 100, // record cost in cents
    type: req.body.itemType,
    day: req.body.purchaseDate.split("/")[1],
    month: req.body.purchaseDate.split("/")[0],
    year: req.body.purchaseDate.split("/")[2],
    user: current_user
  });
  item.save();
  res.redirect("/");
});

app.post("/register", function(req, res) {
  current_user = req.body.username;
  User.register({username: req.body.username}, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/");
      });
    }
  });
});

app.post("/login", function(req, res) {
  current_user = req.body.username;
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function() {
        month = date.getMonth();
        year = date.getYear();
        month_year = date.getMonthYear();
        res.redirect("/");
      });
    }
  });
});

app.post("/delete", function(req, res) {
  const day = date.getDate();
  const listTitle = req.body.listName;
  Item.deleteOne({_id: req.body.checkbox}, function(err) {
    if (err) {
      console.log(err);
    } else {
      console.log(req.body.checkbox + " deleted successfully.");
      res.redirect("/");
    }
  });
});

app.post("/change-date", function(req, res) {
  const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
  year = Number(req.body.datePicker.split("-")[0]);
  month = Number(req.body.datePicker.split("-")[1]);
  month_year = monthNames[month - 1] + " " + year;
  res.redirect("/");
});

app.listen(3000, function() {
  console.log("Server started on port 3000");
});
