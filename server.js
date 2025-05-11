require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Models
const CompetitionItem = mongoose.model('CompetitionItem', {
  name: String,
  stream: String,
  category: String
});

const College = mongoose.model('College', {
  name: String,
  stream: String
});

const PointsEntry = mongoose.model('PointsEntry', {
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompetitionItem' },
  points: Number
});

// Routes
// Competition Items
app.get('/api/items', async (req, res) => {
  try {
    const items = await CompetitionItem.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { name, stream, category } = req.body;
  const item = new CompetitionItem({ name, stream, category });
  
  try {
    const newItem = await item.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await CompetitionItem.findByIdAndDelete(req.params.id);
    await PointsEntry.deleteMany({ itemId: req.params.id });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Colleges
app.get('/api/colleges', async (req, res) => {
  try {
    const colleges = await College.find();
    res.json(colleges);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/colleges/stream/:stream', async (req, res) => {
  try {
    const colleges = await College.find({ stream: req.params.stream });
    res.json(colleges);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/colleges', async (req, res) => {
  const { name, stream } = req.body;
  const college = new College({ name, stream });
  
  try {
    const newCollege = await college.save();
    res.status(201).json(newCollege);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/colleges/:id', async (req, res) => {
  try {
    await College.findByIdAndDelete(req.params.id);
    await PointsEntry.deleteMany({ collegeId: req.params.id });
    res.json({ message: 'College deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Points
app.get('/api/points', async (req, res) => {
  try {
    const points = await PointsEntry.find()
      .populate('collegeId')
      .populate('itemId');
    res.json(points);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/points', async (req, res) => {
  const pointsToSave = req.body;
  
  try {
    // First delete all existing points for these college/item combinations
    await PointsEntry.deleteMany({
      $or: pointsToSave.map(p => ({
        collegeId: p.collegeId,
        itemId: p.itemId
      }))
    });
    
    // Then insert the new points
    const savedPoints = await PointsEntry.insertMany(pointsToSave);
    res.status(201).json(savedPoints);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Results
app.get('/api/results', async (req, res) => {
  try {
    const { stream, category } = req.query;
    
    // Get all items for the stream/category
    let itemsQuery = { stream };
    if (category) itemsQuery.category = category;
    const items = await CompetitionItem.find(itemsQuery);
    
    // Get all colleges for the stream
    const colleges = await College.find({ stream });
    
    // Get all points for these colleges and items
    const points = await PointsEntry.find({
      collegeId: { $in: colleges.map(c => c._id) },
      itemId: { $in: items.map(i => i._id) }
    })
    .populate('collegeId')
    .populate('itemId');
    
    // Format the results
    const results = {
      stream,
      category: category || null,
      items: items.map(item => item.name),
      colleges: colleges.map(college => {
        const collegePoints = points.filter(p => p.collegeId._id.equals(college._id));
        const pointsMap = {};
        collegePoints.forEach(p => {
          pointsMap[p.itemId.name] = p.points;
        });
        
        const total = collegePoints.reduce((sum, p) => sum + p.points, 0);
        
        return {
          name: college.name,
          points: pointsMap,
          total
        };
      })
    };
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Clear all data
app.delete('/api/clear', async (req, res) => {
  try {
    await Promise.all([
      CompetitionItem.deleteMany({}),
      College.deleteMany({}),
      PointsEntry.deleteMany({})
    ]);
    res.json({ message: 'All data cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});