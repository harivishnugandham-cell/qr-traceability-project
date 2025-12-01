// server.js

const express = require('express');
const mysql = require('mysql2');
require('dotenv').config();
const cors = require('cors'); // <--- ADDED: Import the CORS package

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins. This allows your frontend (port 5500) 
// to fetch data from your backend API (port 3000).
app.use(cors()); // <--- ADDED: Use the CORS middleware

// Middleware to parse JSON bodies
app.use(express.json());

// ----------------------------------------------------
// Database Connection Pool (using the .env file)
// ----------------------------------------------------
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'product_trace', // The schema you created in Workbench
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise(); // Use promise wrapper for async/await


// ----------------------------------------------------
// DATABASE CONNECTION TEST & SERVER STARTUP
// ----------------------------------------------------
pool.getConnection()
    .then(connection => {
        console.log("Database connection successful!");
        connection.release(); // Release the connection immediately

        // Start listening ONLY after a successful connection test
        app.listen(PORT, () => {
            console.log(`Traceability API Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("!!! FATAL: DATABASE CONNECTION FAILED !!!");
        console.error("Error details:", err.message);
        console.error("Please check your .env file password and ensure MySQL server is running.");
        // Exit the process so the application doesn't run without a database
        process.exit(1); 
    });


// ----------------------------------------------------
// API ROUTES START HERE
// ----------------------------------------------------

// Simple test route to confirm server is running
app.get('/', (req, res) => {
    res.send('Traceability API Server Running.');
});

// ----------------------------------------------------
// 1. Customer Scanning Route (GET)
// ----------------------------------------------------
app.get('/api/track', async (req, res) => {
    const productId = req.query.id;

    if (!productId) {
        return res.status(400).json({ error: 'Product ID is required.' });
    }

    try {
        // Query joins all four tables (Products, Farmer, Distributor, Retailer)
        const query = `
            SELECT 
                P.ProductID, P.ProductType, P.BatchID,
                F.DateHarvested, F.Location_Lat AS FarmerLat, F.Location_Lon AS FarmerLon, F.InitialCost,
                D.DateShipped, D.Location_Address AS DistributorLocation, D.DistributionCost,
                R.DateSold, R.Store_Name, R.FinalPrice
            FROM Products P
            LEFT JOIN FarmerLog F ON P.ProductID = F.ProductID
            LEFT JOIN DistributorLog D ON P.ProductID = D.ProductID
            LEFT JOIN RetailerLog R ON P.ProductID = R.ProductID
            WHERE P.ProductID = ?;
        `;
        
        const [rows] = await pool.execute(query, [productId]); 

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product journey not found.' });
        }

        res.json({
            message: "Supply Chain Journey Retrieved",
            journey: rows[0] // Returns the combined row of data
        });

    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ error: 'Internal Server Error during data retrieval.' });
    }
});


// ----------------------------------------------------
// 2. Product Initialization Route (POST) - By Farmer/Producer
// ----------------------------------------------------
app.post('/api/product/init', async (req, res) => {
    const { ProductType, BatchID } = req.body;
    
    // Simple unique ID generation
    const ProductID = `PID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
        const productInsertQuery = `
            INSERT INTO Products (ProductID, ProductType, BatchID) 
            VALUES (?, ?, ?);
        `;
        await pool.execute(productInsertQuery, [ProductID, ProductType, BatchID]);
        
        res.status(201).json({ 
            message: 'Product initialized successfully. Use this ID for logs and QR code.',
            ProductID: ProductID
        });
        
    } catch (error) {
        console.error('Error initializing product:', error);
        res.status(500).json({ error: 'Failed to initialize product.' });
    }
});

// ----------------------------------------------------
// 3. Farmer Data Entry Route (POST)
// ----------------------------------------------------
app.post('/api/log/farmer', async (req, res) => {
    const { ProductID, DateHarvested, Location_Lat, Location_Lon, InitialCost } = req.body;

    if (!ProductID || !DateHarvested || !Location_Lat) {
        return res.status(400).json({ error: 'Missing required farmer fields.' });
    }

    try {
        const query = `
            INSERT INTO FarmerLog (ProductID, DateHarvested, Location_Lat, Location_Lon, InitialCost) 
            VALUES (?, ?, ?, ?, ?);
        `;
        await pool.execute(query, [ProductID, DateHarvested, Location_Lat, Location_Lon, InitialCost]);

        res.status(201).json({ message: 'Farmer log recorded successfully.' });
    } catch (error) {
        console.error('Error logging farmer data:', error);
        res.status(500).json({ error: 'Failed to record farmer log.' });
    }
});

// ----------------------------------------------------
// 4. Distributor Data Entry Route (POST)
// ----------------------------------------------------
app.post('/api/log/distributor', async (req, res) => {
    const { ProductID, Location_Address, DateShipped, DistributionCost } = req.body;

    if (!ProductID || !DateShipped || !Location_Address) {
        return res.status(400).json({ error: 'Missing required distributor fields.' });
    }

    try {
        const query = `
            INSERT INTO DistributorLog (ProductID, Location_Address, DateShipped, DistributionCost) 
            VALUES (?, ?, ?, ?);
        `;
        await pool.execute(query, [ProductID, Location_Address, DateShipped, DistributionCost]);

        res.status(201).json({ message: 'Distributor log recorded successfully.' });
    } catch (error) {
        console.error('Error logging distributor data:', error);
        res.status(500).json({ error: 'Failed to record distributor log.' });
    }
});

// ----------------------------------------------------
// 5. Retailer Data Entry Route (POST)
// ----------------------------------------------------
app.post('/api/log/retailer', async (req, res) => {
    const { ProductID, Store_Name, DateSold, FinalPrice } = req.body;

    if (!ProductID || !DateSold || !Store_Name) {
        return res.status(400).json({ error: 'Missing required retailer fields.' });
    }

    try {
        const query = `
            INSERT INTO RetailerLog (ProductID, Store_Name, DateSold, FinalPrice) 
            VALUES (?, ?, ?, ?);
        `;
        await pool.execute(query, [ProductID, Store_Name, DateSold, FinalPrice]);

        res.status(201).json({ message: 'Retailer log recorded successfully.' });
    } catch (error) {
        console.error('Error logging retailer data:', error);
        res.status(500).json({ error: 'Failed to record retailer log.' });
    }
});