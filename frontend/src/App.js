import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Use environment variable for API URL
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [goldPrice, setGoldPrice] = useState(0);
  const [products, setProducts] = useState([]);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [priceRes, productsRes] = await Promise.all([
        axios.get(`${API_URL}/api/gold-price`),
        axios.get(`${API_URL}/api/products`)
      ]);
      
      setGoldPrice(priceRes.data.price_per_gram || 0);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage('⚠️ Cannot connect to server. Please check backend URL.');
    }
  };

  const updateGoldPrice = async () => {
    if (!newPrice) {
      setMessage('⚠️ Please enter a price');
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/gold-price`, {
        price_per_gram: parseFloat(newPrice)
      });
      
      setMessage(`✅ ${response.data.message}`);
      setNewPrice('');
      fetchData();
    } catch (error) {
      setMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addSampleProduct = async () => {
    const products = [
      { name: "24K Gold Necklace", weight: 10.5, carat: "24K", category: "Necklace" },
      { name: "22K Gold Bracelet", weight: 8.2, carat: "22K", category: "Bracelet" },
      { name: "18K Gold Ring", weight: 3.5, carat: "18K", category: "Ring" },
      { name: "21K Gold Earrings", weight: 5.0, carat: "21K", category: "Earrings" }
    ];
    
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    
    try {
      await axios.post(`${API_URL}/api/products`, {
        ...randomProduct,
        making_charges: 5,
        profit_margin: 10
      });
      setMessage('✅ Sample product added!');
      fetchData();
    } catch (error) {
      setMessage('❌ Error adding product');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <i className="fas fa-gem"></i>
          <h1>Egypt Gold Store</h1>
        </div>
        <div className="live-price">
          <span className="label">Live Gold Price:</span>
          <span className="price">{goldPrice} EGP/g</span>
        </div>
      </header>

      <main className="main">
        {/* Admin Section */}
        <section className="admin-section">
          <h2><i className="fas fa-cog"></i> Admin Control Panel</h2>
          
          <div className="card">
            <h3>Update Gold Price</h3>
            <p>Changing this price will update ALL product prices automatically</p>
            
            <div className="input-group">
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Enter new gold price per gram"
              />
              <button 
                onClick={updateGoldPrice} 
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Updating...' : 'Update Price'}
              </button>
            </div>
            
            <div className="actions">
              <button onClick={addSampleProduct} className="btn-secondary">
                <i className="fas fa-plus"></i> Add Sample Product
              </button>
              <button onClick={fetchData} className="btn-secondary">
                <i className="fas fa-sync"></i> Refresh Data
              </button>
            </div>
            
            {message && (
              <div className="message">
                {message}
              </div>
            )}
          </div>
        </section>

        {/* Products Section */}
        <section className="products-section">
          <h2><i className="fas fa-shopping-bag"></i> Products ({products.length})</h2>
          
          {products.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-box-open"></i>
              <p>No products yet. Add some using the admin panel!</p>
            </div>
          ) : (
            <div className="products-grid">
              {products.map(product => (
                <div key={product.id} className="product-card">
                  <div className="product-header">
                    <h3>{product.name}</h3>
                    <span className="carat-badge">{product.carat}</span>
                  </div>
                  
                  <div className="product-details">
                    <div className="detail">
                      <span>Weight:</span>
                      <strong>{product.weight}g</strong>
                    </div>
                    <div className="detail">
                      <span>Making Charges:</span>
                      <strong>{product.making_charges}%</strong>
                    </div>
                    <div className="detail">
                      <span>Profit Margin:</span>
                      <strong>{product.profit_margin}%</strong>
                    </div>
                  </div>
                  
                  <div className="product-price">
                    <div className="final-price">
                      {product.selling_price?.toLocaleString()} EGP
                    </div>
                    <div className="price-breakdown">
                      Gold value: {Math.round(product.weight * goldPrice * 0.916)} EGP
                    </div>
                  </div>
                  
                  <button className="buy-btn">
                    <i className="fas fa-shopping-cart"></i> Add to Cart
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>© 2024 Egypt Gold Store - Live Gold Pricing System</p>
        <p>Automatically updates prices based on gold market rates</p>
      </footer>
    </div>
  );
}

export default App;
