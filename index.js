const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/ussd", (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  let response = "";

  if (text === "") {
    response = `CON Welcome to My USSD App
1. Check balance
2. Buy airtime`;
  } else if (text === "1") {
    response = "END Your balance is RWF 1,000";
  } else if (text === "2") {
    response = "END Airtime purchase feature coming soon!";
  } else {
    response = "END Invalid option. Try again.";
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`USSD app listening on port ${PORT}`);
});
