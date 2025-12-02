// server.js (UPDATED FOR POSTGRESQL)

const express = require('express');
const { Pool } = require('pg'); // <-- 1. Changed from 'mysql2' to 'pg'
require('dotenv').config();
const cors = require('cors'); 

const app = express();
// NOTE: For Render, the PORT environment variable is automatically provided.
const PORT = process.env.PORT || 3000; 

// Enable CORS for all origins.
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// ----------------------------------------------------
// Database Connection Pool (using the .env file)
// ----------------------------------------------------
const pool = new Pool({ // <-- 2. Changed from mysql.createPool to pg.Pool
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || 'product_trace', // Use DB_NAME for schema
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } // Required for external connections like Render
});


// ----------------------------------------------------
// DATABASE CONNECTION TEST & SERVER STARTUP
// ----------------------------------------------------
pool.connect()
    .then(client => { // <-- Changed from pool.getConnection()
        console.log("Database connection successful!");
        client.release(); // Release the connection immediately

        // Start listening ONLY after a successful connection test
        app.listen(PORT, () => {
            console.log(`Traceability API Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("!!! FATAL: DATABASE CONNECTION FAILED !!!");
        console.error("Error details:", err.message);
        console.error("Please check your .env file password and ensure the public database is running.");
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
        // Query joins all four tables (Note: Uses $1 placeholder)
        const query = `
            SELECT 
                P.ProductID, P.ProductType, P.BatchID,
                F.DateHarvested, F.Location_Lat AS "farmerLat", F.Location_Lon AS "farmerLon", F.InitialCost,
                D.DateShipped, D.Location_Address AS "distributorLocation", D.DistributionCost,
                R.DateSold, R.Store_Name, R.FinalPrice
            FROM Products P
            LEFT JOIN FarmerLog F ON P.ProductID = F.ProductID
            LEFT JOIN DistributorLog D ON P.ProductID = D.ProductID
            LEFT JOIN RetailerLog R ON P.ProductID = R.ProductID
            WHERE P.ProductID = $1; 
        `;
        
        const result = await pool.query(query, [productId]); // <-- Changed from pool.execute to pool.query

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product journey not found.' });
        }

        res.json({
            message: "Supply Chain Journey Retrieved",
            journey: result.rows[0] // <-- PostgreSQL returns results in a 'rows' array
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
        // Uses $1, $2, $3 placeholders
        const productInsertQuery = `
            INSERT INTO Products (ProductID, ProductType, BatchID) 
            VALUES ($1, $2, $3); 
        `;
        await pool.query(productInsertQuery, [ProductID, ProductType, BatchID]); // <-- pool.query
        
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
        // Uses $1, $2, $3, $4, $5 placeholders
        const query = `
            INSERT INTO FarmerLog (ProductID, DateHarvested, Location_Lat, Location_Lon, InitialCost) 
            VALUES ($1, $2, $3, $4, $5); 
        `;
        await pool.query(query, [ProductID, DateHarvested, Location_Lat, Location_Lon, InitialCost]); // <-- pool.query

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
        // Uses $1, $2, $3, $4 placeholders
        const query = `
            INSERT INTO DistributorLog (ProductID, Location_Address, DateShipped, DistributionCost) 
            VALUES ($1, $2, $3, $4); 
        `;
        await pool.query(query, [ProductID, Location_Address, DateShipped, DistributionCost]); // <-- pool.query

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
        // Uses $1, $2, $3, $4 placeholders
        const query = `
            INSERT INTO RetailerLog (ProductID, Store_Name, DateSold, FinalPrice) 
            VALUES ($1, $2, $3, $4); 
        `;
        await pool.query(query, [ProductID, Store_Name, DateSold, FinalPrice]); // <-- pool.query

        res.status(201).json({ message: 'Retailer log recorded successfully.' });
    } catch (error) {
        console.error('Error logging retailer data:', error);
        res.status(500).json({ error: 'Failed to record retailer log.' });
    }
});