const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "ussd_app",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL database.");
});

// Define services and sub-options
const services = {
  en: [
    "Check balance", "Buy airtime", "Send money", "Withdraw money", "Deposit money",
    "Pay bills", "Buy data", "Loans", "Savings", "Customer support"
  ],
  rw: [
    "Reba amafaranga ufite", "Gura airtime", "Ohereza amafaranga", "Kuramo amafaranga", "Shyiramo amafaranga",
    "Kwishyura fagitire", "Gura data", "Inguzanyo", "Kubitsa", "Serivisi z'abakiriya"
  ],
};

const subOptions = {
  en: [
    ["1. View balance", "2. Last transactions", "0. Back"],
    ["1. Airtime for self", "2. Airtime for others", "0. Back"],
    ["1. To own number", "2. To other number", "0. Back"],
    ["1. Agent withdrawal", "2. ATM withdrawal", "0. Back"],
    ["1. Deposit at agent", "2. Deposit via mobile", "0. Back"],
    ["1. Electricity bill", "2. Water bill", "0. Back"],
    ["1. Buy daily data", "2. Buy weekly data", "0. Back"],
    ["1. Loan application", "2. Loan balance", "0. Back"],
    ["1. Save money", "2. Withdraw savings", "0. Back"],
    ["1. Call support", "2. FAQ", "0. Back"],
  ],
  rw: [
    ["1. Reba amafaranga", "2. Amateka y'ibikorwa", "0. Subira inyuma"],
    ["1. Airtime ku nimero yawe", "2. Airtime ku yundi", "0. Subira inyuma"],
    ["1. Ku nimero yawe", "2. Ku yindi nimero", "0. Subira inyuma"],
    ["1. Kuramo ku agent", "2. Kuramo ku ATM", "0. Subira inyuma"],
    ["1. Kubitsa ku agent", "2. Kubitsa kuri mobile", "0. Subira inyuma"],
    ["1. Kwishyura amashanyarazi", "2. Kwishyura amazi", "0. Subira inyuma"],
    ["1. Gura data y'umunsi", "2. Gura data y'icyumweru", "0. Subira inyuma"],
    ["1. Gusaba inguzanyo", "2. Amakuru ku nguzanyo", "0. Subira inyuma"],
    ["1. Kubika amafaranga", "2. Gukuramo amafaranga", "0. Subira inyuma"],
    ["1. Hamagara serivisi", "2. Ibibazo bisanzwe", "0. Subira inyuma"],
  ],
};

// Helper function to show paginated services
function getPaginatedServices(lang, page) {
  const list = services[lang === "1" ? "en" : "rw"];
  const start = page * 5;
  const end = start + 5;
  const items = list.slice(start, end);
  let response = `CON ${lang === "1" ? "Select service:" : "Hitamo serivisi:"}\n`;
  items.forEach((item, i) => response += `${i + 1}. ${item}\n`);
  if (page > 0) response += `0. ${lang === "1" ? "Previous" : "Subira inyuma"}\n`;
  if (end < list.length) response += `n. ${lang === "1" ? "Next" : "Egera"}`;
  return response.trim();
}

// Save or update session
function updateSession(sessionId, phone, input, lang, page) {
  const sql = `
    INSERT INTO session (sessionID, phoneNumber, userInput, language, page)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      phoneNumber = VALUES(phoneNumber),
      userInput = VALUES(userInput),
      language = VALUES(language),
      page = VALUES(page)
  `;
  db.query(sql, [sessionId, phone, input, lang, page], (err) => {
    if (err) console.error("Session update error:", err);
  });
}

// Log transactions
function insertTransaction(phone, service, subService, status) {
  const sql = `INSERT INTO Transactions (phoneNumber, service, subService, status) VALUES (?, ?, ?, ?)`;
  db.query(sql, [phone, service, subService, status], (err) => {
    if (err) console.error("Transaction insert error:", err);
  });
}

// Update or insert balance
function updateBalance(phone, amount) {
  const sql = `
    INSERT INTO balance (phoneNumber, amount)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  `;
  db.query(sql, [phone, amount], (err) => {
    if (err) console.error("Balance update error:", err);
  });
}

// Fetch balance
function getBalance(phone, callback) {
  db.query("SELECT amount FROM balance WHERE phoneNumber = ?", [phone], (err, results) => {
    if (err) return callback(err, null);
    if (results.length > 0) return callback(null, results[0].amount);
    return callback(null, 0);
  });
}

// Deduct balance
function deductBalance(phone, amount, callback) {
  getBalance(phone, (err, currentBalance) => {
    if (err) return callback(err);
    if (currentBalance >= amount) {
      db.query("UPDATE balance SET amount = amount - ? WHERE phoneNumber = ?", [amount, phone], (err) => {
        if (err) return callback(err);
        return callback(null, true);
      });
    } else {
      return callback(null, false);
    }
  });
}

// USSD logic
app.post("/ussd", (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const inputs = text === "" ? [] : text.split("*");
  let response = "";
  let lang = "1", page = 0;

  db.query("SELECT * FROM session WHERE sessionID = ?", [sessionId], (err, results) => {
    if (err) {
      console.error("Error querying session table:", err);
      return res.send("END Internal server error.");
    }
  
    if (results.length > 0) {
      lang = results[0].language;
      page = results[0].page;
    }

    const serviceList = services[lang === "1" ? "en" : "rw"];
    const subList = subOptions[lang === "1" ? "en" : "rw"];

    if (inputs.length === 0) {
      response = `CON Welcome to My USSD App\n1. English\n2. Ikinyarwanda`;
      updateSession(sessionId, phoneNumber, "", lang, page);
      return res.send(response);
    }

    lang = inputs[0];
    if (!["1", "2"].includes(lang)) return res.send("END Invalid language selection.");

    for (let i = 1; i < inputs.length; i++) {
      if (inputs[i] === "n") page++;
      if (inputs[i] === "0") page--;
    }
    if (page < 0) page = 0;

    const level = inputs.length;

    if (level === 1 || (level === 2 && ["n", "0"].includes(inputs[1]))) {
      response = getPaginatedServices(lang, page);
    } else if (level === 2) {
      const selected = parseInt(inputs[1]);
      const index = page * 5 + selected - 1;
      if (isNaN(selected) || index >= serviceList.length) {
        response = "END Invalid service selection.";
      } else {
        response = `CON ${subList[index].join("\n")}`;
      }
    } else if (level === 3) {
      const serviceIndex = page * 5 + parseInt(inputs[1]) - 1;
      const subIndex = parseInt(inputs[2]) - 1;
      const service = serviceList[serviceIndex];
      const sub = subList[serviceIndex][subIndex];

      const isDeposit = service.toLowerCase().includes("deposit") || sub.toLowerCase().includes("kubitsa");
      const isBuyAirtime = service.toLowerCase().includes("airtime");
      const isSendMoney = service.toLowerCase().includes("send money") || sub.toLowerCase().includes("ohereza");

      if (isDeposit || isBuyAirtime || isSendMoney) {
        response = lang === "1" ? "CON Enter amount:" : "CON Andika amafaranga:";
      } else if (service.toLowerCase().includes("balance")) {
        getBalance(phoneNumber, (err, balance) => {
          response = lang === "1"
            ? `END Your balance is: ${balance}`
            : `END Ufite amafaranga: ${balance}`;
          res.set("Content-Type", "text/plain");
          res.send(response);
        });
        return;
      } else {
        insertTransaction(phoneNumber, service, sub, "Processed");
        response = lang === "1" ? "END Service processed." : "END Serivisi irakozwe.";
      }
    } else if (level === 4) {
      const serviceIndex = page * 5 + parseInt(inputs[1]) - 1;
      const subIndex = parseInt(inputs[2]) - 1;
      const amount = parseFloat(inputs[3]);

      const service = serviceList[serviceIndex];
      const sub = subList[serviceIndex][subIndex];

      const isDeposit = service.toLowerCase().includes("deposit") || sub.toLowerCase().includes("kubitsa");
      const isBuyAirtime = service.toLowerCase().includes("airtime");
      const isSendMoney = service.toLowerCase().includes("send money") || sub.toLowerCase().includes("ohereza");

      if (isNaN(amount) || amount <= 0) {
        response = lang === "1" ? "END Invalid amount." : "END Amafaranga winjije siyo.";
      } else if (isDeposit) {
        updateBalance(phoneNumber, amount);
        insertTransaction(phoneNumber, service, `${sub} - Amount: ${amount}`, "Success");
        response = lang === "1"
          ? `END Deposit of ${amount} successful.`
          : `END Kubitsa amafaranga ${amount} byagenze neza.`;
      } else if (isBuyAirtime || isSendMoney) {
        deductBalance(phoneNumber, amount, (err, success) => {
          if (err || !success) {
            response = lang === "1"
              ? "END Insufficient balance."
              : "END Nta mafaranga ahagije.";
          } else {
            insertTransaction(phoneNumber, service, `${sub} - Amount: ${amount}`, "Success");
            response = lang === "1"
              ? `END ${service} of ${amount} completed.`
              : `END ${service} ya ${amount} yarangije.`;
          }
          res.set("Content-Type", "text/plain");
          res.send(response);
        });
        return;
      } else {
        response = "END Invalid request.";
      }
    } else {
      response = "END Invalid request.";
    }

    updateSession(sessionId, phoneNumber, text, lang, page);
    res.set("Content-Type", "text/plain");
    res.send(response);
  });
});
process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});


// Start server
app.listen(3000, () => {
  console.log("USSD app running on port 3000");
});
