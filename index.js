const express = require("express");
const app = express();
const cors = require("cors")
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
app.use(cors());
app.use(express.json());

//mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8xwcd.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({
            message: 'unauthorized'
        })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({
                message: 'Forbidden access'
            })
        }
        req.decoded = decoded;
        next()

    })



}

async function run() {
    try {
        await client.connect()
        const servicesCollection = client.db("doctors_portal").collection("services")
        const bookingCollection = client.db("doctors_portal").collection("booking")
        const userCollection = client.db("doctors_portal").collection("user")
        const doctorsCollection = client.db("doctors_portal").collection("doctors")


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: "Forbidden" })
            }

        }


        app.get('/user', verifyJWT, async (req, res) => {
            const query = {};
            const cursor = userCollection.find(query);
            const users = await cursor.toArray();
            res.send(users)
        });
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })



        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)

        });
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const option = { upsert: true };
            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter, updateDoc, option);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ result, token })

        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })
        app.get('/availableBookings', async (req, res) => {
            const date = req.query.date || "May 11, 2022";

            const services = await servicesCollection.find().toArray();
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            services.forEach(service => {
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.time)
                const availableSlots = service.slots.filter(s => !bookedSlots.includes(s));
                service.slots = availableSlots;

            })


            res.send(services)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, time: booking?.time, patientEmail: booking.patientEmail }
            const bookingExists = await bookingCollection.findOne(query)
            if (bookingExists) {
                return res.send({ success: false, booking: bookingExists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result })
        })
        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail }
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        })
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)
        })
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {

            const result = await doctorsCollection.find().toArray();
            res.send(result)
        })
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await doctorsCollection.deleteOne(query);
            res.send(result)
        })

    }
    finally {

    }


}
run().catch(console.dir)


app.get('/', (req, res) => {
    res.send("Doctors Portal Server Running")
})


app.listen(port, () => {
    console.log(port, 'Running')
})