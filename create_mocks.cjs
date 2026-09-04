const fs = require('fs');
const path = require('path');
const dataDir = path.join(process.cwd(), 'src', 'data');
const servicesDir = path.join(process.cwd(), 'src', 'services', 'mock');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir, { recursive: true });

const files = {
  'customers.mock.ts': `export const customers = [
  { id: 'CUST-001', name: 'Rajesh Kumar', mobile: '9876543210', email: 'rajesh@example.com', city: 'Pune' },
  { id: 'CUST-002', name: 'Priya Sharma', mobile: '9123456789', email: 'priya@test.com', city: 'Mumbai' }
];`,
  'leads.mock.ts': `export const leads = [
  { id: 'LEAD-001', customerId: 'CUST-001', vehicleId: 'VEH-001', stage: 'New', score: 'Hot' }
];`,
  'vehicles.mock.ts': `export const vehicles = [
  { id: 'VEH-001', brand: 'Honda', model: 'Activa 6G', variant: 'DLX', color: 'Pearl Spartan Red', exShowroomPrice: 77000 },
  { id: 'VEH-002', brand: 'TVS', model: 'Jupiter', variant: 'ZX', color: 'Starlight Blue', exShowroomPrice: 82000 }
];`,
  'inventory.mock.ts': `export const inventory = [
  { id: 'INV-001', vehicleId: 'VEH-001', status: 'Available', vin: 'ME4123456' }
];`,
  'quotations.mock.ts': `export const quotations = [
  { id: 'QT-001', customerId: 'CUST-001', vehicleId: 'VEH-001', amount: 92000, status: 'Draft' }
];`,
  'finance.mock.ts': `export const finance = [];`,
  'testRides.mock.ts': `export const testRides = [];`,
  'followUps.mock.ts': `export const followUps = [];`,
  'notifications.mock.ts': `export const notifications = [];`,
  'dashboard.mock.ts': `export const dashboard = {};`
};

Object.entries(files).forEach(([name, content]) => {
  fs.writeFileSync(path.join(dataDir, name), content);
});

console.log('Mock files created successfully');
