//jshint esversion:6

exports.getDate = function() {
  const today = new Date();
  const options = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  };
  return today.toLocaleDateString("en-US", options);
};

exports.getMonth = function() {
  const today = new Date();
  const options = {
    month: "numeric"
  };
  return Number(today.toLocaleDateString("en-US", options));
};

exports.getYear = function() {
  const today = new Date();
  const options = {
    year: "numeric"
  };
  return Number(today.toLocaleDateString("en-US", options));
};

exports.getMonthYear = function() {
  const today = new Date();
  const options = {
    month: "long",
    year: "numeric"
  };
  return today.toLocaleDateString("en-US", options);
};

exports.getDay = function () {
  const today = new Date();
  const options = {
    weekday: "long"
  };
  return today.toLocaleDateString("en-US", options);
};
