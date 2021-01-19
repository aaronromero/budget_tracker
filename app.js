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
const Item = mongoose.model("Item", itemsSchema);

const incomeSchema = new mongoose.Schema({
  amount: Number,
  type: String,
  day: Number,
  month: Number,
  year: Number,
  user: String
});
const Income = mongoose.model("Income", incomeSchema);

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
  // TODO move variables inside queries
  var list_summary = [];
  var grouped_totals = [];
  var month_total = [];
  var month_running_total = [];
  var queries = [];
  var known_categories = [];
  const day = date.getDate();
  // Get list of expenses this month
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$project": { "name":1, "type":1, "day": 1, "month": 1, "year": 1, "cost": { "$divide": [ "$cost", 100 ] } } }, { "$sort": { "day": -1 } } ], function(err, items) {
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
  // Get monthly running totals
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } },  { "$group": { "_id": { "day": "$day" }, "cost": { "$sum": '$cost' } } }, { "$project": { "day": 1, "month": 1, "cost": { "$divide": [ "$cost", 100 ] } } }, { "$sort": { "_id.day": 1 } }], function(err, items) {
      let total = 0;
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          total += Number(items[i]["cost"])
          month_running_total[i] = { "year": year, "month": month - 1, "day": items[i]["_id"]["day"], "cost": total};
        }
      }
      cb(null, month_running_total);
    });
  });
  // Get grouped breakdown of costs 
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$group": { "_id": { "type": "$type" }, "cost": { "$sum": '$cost' }, "count": { "$sum": 1 } } }, { "$project": { "cost": { "$divide": [ "$cost", 100 ] }, "count": "$count" } }, { "$sort": { "cost": -1 } } ], function(err, items) {
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
    Item.aggregate( [ { "$match": { "year": year, "month": month, "user": current_user } }, { "$group": { "_id": null, "cost": { "$sum": '$cost' }, "count": { "$sum": 1 } } }, { "$project": { "cost": { "$divide": [ "$cost", 100 ] }, "count": "$count" } } ], function(err, items) {
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
  // Get list of known categories 
  queries.push(function (cb) {
    Item.aggregate( [ { "$match": { "user": current_user } }, { "$group": { "_id": { "type": "$type" }, "count": { "$sum": 1 } } }, { "$sort": { "count": -1 } } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          known_categories[i] = items[i];
        }
      }
      cb(null, known_categories);
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
      monthlyRunningTotals: docs[1],
      groupedTotals: docs[2],
      monthlyTotals: docs[3],
      monthlyTotalsTitle: month_year,
      knownCategories: docs[4]
    });
  })
});


app.get("/payday", function(req, res) {
  if (!req.isAuthenticated()) {
    res.redirect("/home");
  }
  // TODO move variables inside queries
  var list_summary = [];
  var grouped_totals = [];
  var month_total = [];
  var month_running_total = [];
  var queries = [];
  var known_categories = [];
  const day = date.getDate();
  // Get income statements
  queries.push(function (cb) {
    const income_statements = [];
    Income.aggregate( [ { "$match": { "user": current_user } }, { "$project": { "type":1, "day": 1, "month": 1, "year": 1, "amount": { "$divide": [ "$amount", 100 ] } } }, { "$sort": { "year": -1, "month": -1, "day": -1 } }, { "$limit": 10 } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          income_statements[i] = items[i];
        }
      }
      cb(null, income_statements);
    });
  });
  // Get list of known income types
  queries.push(function (cb) {
    const known_types = [];
    Income.aggregate( [ { "$match": { "user": current_user } }, { "$group": { "_id": { "type": "$type" }, "count": { "$sum": 1 } } }, { "$sort": { "count": -1 } } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          known_types[i] = items[i];
        }
      }
      cb(null, known_types);
    });
  });
  async.parallel(queries, function(err, docs) {
    if (err) {
        throw err;
    }
    res.render("payday", {
      currentUser: current_user,
      listTitle: day,
      incomeStatements: docs[0],
      knownTypes: docs[1]
    });
  })
});

app.get("/statistics", function(req, res) {
  if (!req.isAuthenticated()) {
    res.redirect("/home");
  }
  // TODO move variables inside queries
  var month_running_total = [];
  var queries = [];
  const day = date.getDate();
  // Get monthly spending
  queries.push(function (cb) {
    const monthly_spending = [];
    Item.aggregate( [ { "$match": { "user": current_user } },  { "$group": { "_id": { "year": "$year", "month": "$month" }, "cost": { "$sum": '$cost' } } }, { "$project": { "year": 1, "month": 1, "cost": { "$divide": [ "$cost", 100 ] } } }, { "$sort": { "_id.year": -1, "_id.month": -1 } }, { "$limit": 12 } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          monthly_spending[i] = items[i];
          monthly_spending[i]["_id"]["month"] -= 1;
        }
      }
      cb(null, monthly_spending);
    });
  });
  // Get monthly income
  queries.push(function (cb) {
    const monthly_income = [];
    Income.aggregate( [ { "$match": { "user": current_user } },  { "$group": { "_id": { "year": "$year", "month": "$month" }, "earnings": { "$sum": '$amount' } } }, { "$project": { "year": 1, "month": 1, "earnings": { "$divide": [ "$earnings", 100 ] } } }, { "$sort": { "_id.year": -1, "_id.month": -1 } }, { "$limit": 12 } ], function(err, items) {
      if (err) {
        console.log(err);
      } else {
        for (i=0; i<items.length; i++) {
          monthly_income[i] = items[i];
          monthly_income[i]["_id"]["month"] -= 1;
        }
      }
      cb(null, monthly_income);
    });
  });

  async.parallel(queries, function(err, docs) {
    if (err) {
        throw err;
    }
    console.log(docs[1]);
    // calculate monthly net earnings
    const monthly_net_earnings = JSON.parse(JSON.stringify(docs[1]));
    for (i=0; i<docs[1].length; i++) {
      for (j=0; j<docs[0].length; j++) {
        if ( (docs[0][j]['_id']['month'] === docs[1][i]['_id']['month']) && (docs[0][j]['_id']['year'] === docs[1][i]['_id']['year']) ) {
          monthly_net_earnings[i]['earnings'] -= docs[0][j]['cost'];
          break;
        };
      };
    };
    console.log(docs[1]);

    res.render("statistics", {
      currentUser: current_user,
      listTitle: day,
      monthlySpending: docs[0],
      monthlyIncome: docs[1],
      monthlyNetEarnings: monthly_net_earnings
    });
  })
});

app.post("/", function(req, res){
  const day = date.getDate();
  const listTitle = req.body.list;
  const item = new Item({
    name: _.startCase(_.toLower(req.body.newItem)),
    cost: req.body.itemCost * 100, // record cost in cents
    type: _.startCase(_.toLower(req.body.itemType)),
    day: req.body.purchaseDate.split("/")[1],
    month: req.body.purchaseDate.split("/")[0],
    year: req.body.purchaseDate.split("/")[2],
    user: current_user
  });
  item.save();
  res.redirect("/");
});

app.post("/payday", function(req, res){
  const day = date.getDate();
  const listTitle = req.body.list;
  const income = new Income({
    amount: req.body.amount * 100, // record cost in cents
    type: _.startCase(_.toLower(req.body.paymentType)),
    day: req.body.purchaseDate.split("/")[1],
    month: req.body.purchaseDate.split("/")[0],
    year: req.body.purchaseDate.split("/")[2],
    user: current_user
  });
  income.save();
  res.redirect("/payday");
});

//TODO check for duplicate users
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
