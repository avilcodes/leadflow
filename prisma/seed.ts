import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const JsonNull = Prisma.JsonNull;

// ─── Helpers ───

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): Date {
  const now = new Date();
  const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// ─── Data Pools ───

const firstNames = [
  'Sarah', 'James', 'Emily', 'Michael', 'Jessica', 'David', 'Ashley', 'Robert',
  'Amanda', 'Daniel', 'Stephanie', 'Christopher', 'Nicole', 'Matthew', 'Lauren',
  'Andrew', 'Megan', 'Joshua', 'Rachel', 'Ryan', 'Samantha', 'Justin', 'Heather',
  'Brandon', 'Elizabeth', 'Tyler', 'Katherine', 'Nathan', 'Olivia', 'Kevin',
  'Hannah', 'Brian', 'Victoria', 'Patrick', 'Sophie', 'Jason', 'Chloe', 'Eric',
  'Isabella', 'Mark', 'Alexandra', 'Steven', 'Natalie', 'Gregory', 'Allison',
  'Jacob', 'Maria', 'Zachary', 'Christina', 'Benjamin',
];

const lastNames = [
  'Johnson', 'Williams', 'Brown', 'Martinez', 'Anderson', 'Taylor', 'Thomas',
  'Jackson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez',
];

const jobTitles = [
  'CEO', 'CTO', 'VP of Engineering', 'VP of Sales', 'VP of Marketing',
  'Director of Product', 'Director of Engineering', 'Director of Operations',
  'Head of Growth', 'Head of Business Development', 'Chief Revenue Officer',
  'Chief Product Officer', 'Senior Software Engineer', 'Engineering Manager',
  'Product Manager', 'Sales Director', 'Marketing Director', 'COO',
  'Founder', 'Co-Founder', 'General Manager', 'Principal Engineer',
  'Staff Engineer', 'Technical Lead', 'DevOps Lead',
];

const companiesData = [
  { name: 'NovaTech Solutions', domain: 'novatech-solutions.example.com', industry: 'Software', size: '51-200', revenue: '$10M-$25M', funding: 'Series B', location: 'San Francisco, CA', foundedYear: 2018, description: 'Cloud-native developer tools and infrastructure automation platform.' },
  { name: 'Meridian Health Systems', domain: 'meridian-health.example.com', industry: 'Healthcare IT', size: '201-500', revenue: '$50M-$100M', funding: 'Series C', location: 'Boston, MA', foundedYear: 2015, description: 'AI-powered healthcare analytics and patient engagement platform.' },
  { name: 'Apex Financial Group', domain: 'apexfinancial.example.com', industry: 'Fintech', size: '501-1000', revenue: '$100M-$250M', funding: 'Series D', location: 'New York, NY', foundedYear: 2012, description: 'Next-generation payment processing and financial infrastructure.' },
  { name: 'GreenWave Energy', domain: 'greenwave-energy.example.com', industry: 'Clean Energy', size: '51-200', revenue: '$5M-$10M', funding: 'Series A', location: 'Austin, TX', foundedYear: 2020, description: 'Smart grid management and renewable energy optimization.' },
  { name: 'Cipher Security Labs', domain: 'cipherseclabs.example.com', industry: 'Cybersecurity', size: '201-500', revenue: '$25M-$50M', funding: 'Series B', location: 'Washington, DC', foundedYear: 2017, description: 'Enterprise zero-trust security and threat intelligence platform.' },
  { name: 'PulsePoint Analytics', domain: 'pulsepoint-analytics.example.com', industry: 'Data Analytics', size: '11-50', revenue: '$1M-$5M', funding: 'Seed', location: 'Seattle, WA', foundedYear: 2022, description: 'Real-time business intelligence and predictive analytics for SMBs.' },
  { name: 'Vanguard Robotics', domain: 'vanguardrobotics.example.com', industry: 'Robotics', size: '201-500', revenue: '$50M-$100M', funding: 'Series C', location: 'Detroit, MI', foundedYear: 2016, description: 'Industrial automation and collaborative robotics solutions.' },
  { name: 'Horizon Logistics', domain: 'horizon-logistics.example.com', industry: 'Supply Chain', size: '1001-5000', revenue: '$250M-$500M', funding: 'Private Equity', location: 'Chicago, IL', foundedYear: 2008, description: 'AI-driven supply chain optimization and last-mile delivery.' },
  { name: 'Catalyst Learning', domain: 'catalystlearning.example.com', industry: 'EdTech', size: '51-200', revenue: '$5M-$10M', funding: 'Series A', location: 'Denver, CO', foundedYear: 2019, description: 'Adaptive learning platform for corporate training and upskilling.' },
  { name: 'Stratos Cloud Platform', domain: 'stratoscloud.example.com', industry: 'Cloud Infrastructure', size: '501-1000', revenue: '$100M-$250M', funding: 'Series D', location: 'Portland, OR', foundedYear: 2014, description: 'Multi-cloud management and serverless application platform.' },
];

const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const statusWeights = [40, 25, 20, 10, 5]; // distribution percentages

const enrichmentStatuses = ['pending', 'completed', 'failed'];
const enrichmentWeights = [30, 60, 10];

const outreachStatuses = ['none', 'draft', 'sent', 'delivered', 'opened', 'replied'];
const outreachWeights = [25, 15, 15, 20, 15, 10];

const sources = ['apollo', 'prospeo', 'csv', 'manual'];
const sourceWeights = [35, 25, 25, 15];

const tagColors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── Main Seed Function ───

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.activity.deleteMany();
  await prisma.emailEvent.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.campaignLead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.aiAnalysis.deleteMany();
  await prisma.enrichmentJob.deleteMany();
  await prisma.leadTag.deleteMany();
  await prisma.leadSourceRecord.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.company.deleteMany();
  await prisma.apiCredential.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.suppressionEntry.deleteMany();
  await prisma.user.deleteMany();

  // ─── Users ───
  console.log('Creating users...');

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@leadflow.demo',
      name: 'Admin User',
      passwordHash: await hash('password123', 12),
      role: 'admin',
      isActive: true,
      lastLoginAt: new Date(),
    },
  });

  const regularUser = await prisma.user.create({
    data: {
      email: 'user@leadflow.demo',
      name: 'Demo User',
      passwordHash: await hash('password123', 12),
      role: 'user',
      isActive: true,
      lastLoginAt: randomDate(7),
    },
  });

  console.log(`  Created admin: ${adminUser.email}`);
  console.log(`  Created user: ${regularUser.email}`);

  // ─── Companies ───
  console.log('Creating companies...');

  const companies = [];
  for (const companyData of companiesData) {
    const company = await prisma.company.create({
      data: {
        name: companyData.name,
        domain: companyData.domain,
        linkedinUrl: `https://linkedin.com/company/${companyData.domain.split('.')[0]}`,
        website: `https://${companyData.domain}`,
        industry: companyData.industry,
        size: companyData.size,
        revenue: companyData.revenue,
        funding: companyData.funding,
        location: companyData.location,
        foundedYear: companyData.foundedYear,
        description: companyData.description,
      },
    });
    companies.push(company);
  }

  console.log(`  Created ${companies.length} companies`);

  // ─── Tags ───
  console.log('Creating tags...');

  const tagNames = ['Hot Lead', 'Enterprise', 'Startup', 'Decision Maker', 'Technical'];
  const tags = [];
  for (let i = 0; i < tagNames.length; i++) {
    const tag = await prisma.tag.create({
      data: {
        name: tagNames[i],
        color: tagColors[i],
      },
    });
    tags.push(tag);
  }

  console.log(`  Created ${tags.length} tags`);

  // ─── Leads ───
  console.log('Creating leads...');

  const leads = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const firstName = randomItem(firstNames);
    const lastName = randomItem(lastNames);
    const fullName = `${firstName} ${lastName}`;
    const company = randomItem(companies);
    const status = weightedRandom(statuses, statusWeights);
    const enrichmentStatus = weightedRandom(enrichmentStatuses, enrichmentWeights);
    const outreachStatus = weightedRandom(outreachStatuses, outreachWeights);
    const source = weightedRandom(sources, sourceWeights);

    // Generate unique email
    let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.domain}`;
    let suffix = 1;
    while (usedEmails.has(email)) {
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${company.domain}`;
      suffix++;
    }
    usedEmails.add(email);

    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        fullName,
        jobTitle: randomItem(jobTitles),
        email,
        phone: `+1${randomInt(200, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}`,
        linkedinUrl: `https://linkedin.com/in/${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(1, 999)}`,
        location: company.location || 'United States',
        website: `https://${company.domain}`,
        companyName: company.name,
        companyDomain: company.domain,
        companyLinkedinUrl: company.linkedinUrl,
        industry: company.industry,
        companySize: company.size,
        revenue: company.revenue,
        funding: company.funding,
        status,
        enrichmentStatus,
        outreachStatus,
        source,
        sourceLeadId: `${source}-${randomInt(10000, 99999)}`,
        importedAt: randomDate(90),
        companyId: company.id,
        createdAt: randomDate(90),
      },
    });

    leads.push(lead);
  }

  console.log(`  Created ${leads.length} leads`);

  // ─── Tag Assignments ───
  console.log('Assigning tags to leads...');

  let tagAssignments = 0;
  for (const lead of leads) {
    // Assign 0-3 random tags per lead
    const numTags = randomInt(0, 3);
    const shuffledTags = [...tags].sort(() => Math.random() - 0.5).slice(0, numTags);

    for (const tag of shuffledTags) {
      await prisma.leadTag.create({
        data: {
          leadId: lead.id,
          tagId: tag.id,
        },
      });
      tagAssignments++;
    }
  }

  console.log(`  Created ${tagAssignments} tag assignments`);

  // ─── Enrichment Jobs ───
  console.log('Creating enrichment jobs...');

  const enrichmentJobs = [];
  const enrichedLeads = leads.filter((l) => l.enrichmentStatus === 'completed' || l.enrichmentStatus === 'failed');
  const enrichmentLeadSubset = enrichedLeads.slice(0, 20);

  for (const lead of enrichmentLeadSubset) {
    const status = lead.enrichmentStatus === 'completed' ? 'completed' : 'failed';
    const job = await prisma.enrichmentJob.create({
      data: {
        leadId: lead.id,
        provider: 'apify',
        actorId: 'apify/linkedin-profile-scraper',
        providerJobId: `apify-run-${randomInt(100000, 999999)}`,
        type: 'linkedin_scrape',
        status,
        input: { url: lead.linkedinUrl },
        rawOutput: status === 'completed'
          ? {
              headline: lead.jobTitle,
              summary: `Experienced ${lead.jobTitle} at ${lead.companyName}`,
              connections: randomInt(100, 5000),
              experience: [
                {
                  title: lead.jobTitle,
                  company: lead.companyName,
                  duration: `${randomInt(1, 8)} years`,
                },
              ],
            }
          : JsonNull,
        normalizedOutput: status === 'completed'
          ? {
              headline: lead.jobTitle,
              experienceYears: randomInt(3, 20),
              connectionCount: randomInt(100, 5000),
            }
          : JsonNull,
        errorMessage: status === 'failed' ? 'Profile not accessible or rate limited' : null,
        retryCount: status === 'failed' ? randomInt(1, 3) : 0,
        startedAt: randomDate(60),
        completedAt: status === 'completed' ? randomDate(59) : null,
      },
    });
    enrichmentJobs.push(job);
  }

  console.log(`  Created ${enrichmentJobs.length} enrichment jobs`);

  // ─── AI Analyses ───
  console.log('Creating AI analyses...');

  const aiAnalyses = [];
  const analyzedLeads = leads
    .filter((l) => l.enrichmentStatus === 'completed')
    .slice(0, 15);

  for (const lead of analyzedLeads) {
    const painPoints = [
      'Scaling engineering team efficiently',
      'Reducing time-to-market for new features',
      'Improving developer productivity',
      'Managing technical debt',
      'Ensuring security compliance',
      'Optimizing cloud costs',
      'Streamlining CI/CD pipelines',
    ];

    const signals = [
      'Recently raised funding',
      'Hiring for senior roles',
      'Expanding to new markets',
      'Launched new product line',
      'Published thought leadership content',
    ];

    const analysis = await prisma.aiAnalysis.create({
      data: {
        leadId: lead.id,
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptVersion: 'v2.1',
        inputData: {
          lead: { name: lead.fullName, title: lead.jobTitle, company: lead.companyName },
        },
        personSummary: `${lead.fullName} is a seasoned ${lead.jobTitle} at ${lead.companyName}, bringing extensive experience in ${lead.industry || 'technology'} sector leadership.`,
        companySummary: `${lead.companyName} is a ${lead.companySize} employee company in the ${lead.industry || 'technology'} industry with ${lead.revenue || 'undisclosed'} revenue, backed by ${lead.funding || 'undisclosed'} funding.`,
        currentContext: `Currently focused on scaling operations and team growth, with emphasis on technical infrastructure modernization.`,
        signals: signals.sort(() => Math.random() - 0.5).slice(0, randomInt(2, 4)),
        painPoints: painPoints.sort(() => Math.random() - 0.5).slice(0, randomInt(2, 4)),
        priorities: ['Team scaling', 'Infrastructure modernization', 'Process improvement'].slice(0, randomInt(1, 3)),
        personalizations: [
          `Reference their role as ${lead.jobTitle}`,
          `Mention ${lead.companyName}'s growth trajectory`,
          `Connect to ${lead.industry} industry challenges`,
        ],
        outreachAngle: `Position solution as a way to accelerate ${lead.companyName}'s growth while reducing operational overhead.`,
        relevanceReasons: ['Right seniority level', 'Company in growth phase', 'Industry fit'],
        confidenceScore: randomFloat(0.6, 0.95),
        status: 'completed',
        tokensUsed: randomInt(800, 2500),
        costEstimate: randomFloat(0.01, 0.08),
        startedAt: randomDate(45),
        completedAt: randomDate(44),
      },
    });
    aiAnalyses.push(analysis);
  }

  console.log(`  Created ${aiAnalyses.length} AI analyses`);

  // ─── Campaigns ───
  console.log('Creating campaigns...');

  const campaign1 = await prisma.campaign.create({
    data: {
      name: 'Q4 Enterprise Outreach',
      description: 'Targeting enterprise decision makers for Q4 sales push',
      status: 'running',
      senderName: 'Alex Thompson',
      senderEmail: 'alex@leadflow-demo.example.com',
      replyToEmail: 'alex@leadflow-demo.example.com',
      objective: 'Book product demo calls with enterprise engineering leaders',
      targetAudience: 'VP/Director of Engineering at companies with 200+ employees',
      productDescription: 'AI-powered developer productivity platform',
      valueProposition: 'Reduce development cycle times by 40% through intelligent automation',
      tone: 'professional',
      emailLength: 'medium',
      cta: 'Would you be open to a 15-minute call this week?',
      channel: 'email',
      sequenceSteps: 3,
      delayBetweenEmails: 72,
      timezone: 'America/New_York',
      maxPerHour: 20,
      maxPerDay: 100,
      autoApprove: false,
      totalLeads: 30,
      emailsGenerated: 25,
      emailsSent: 18,
      emailsDelivered: 16,
      emailsOpened: 10,
      emailsClicked: 4,
      emailsReplied: 3,
      emailsBounced: 2,
      startedAt: randomDate(30),
      createdById: adminUser.id,
    },
  });

  const campaign2 = await prisma.campaign.create({
    data: {
      name: 'Startup Founders',
      description: 'Outreach to startup founders and CTOs in the tech space',
      status: 'draft',
      senderName: 'Morgan Lee',
      senderEmail: 'morgan@leadflow-demo.example.com',
      objective: 'Introduce platform to early-stage startup technical leaders',
      targetAudience: 'Founders and CTOs at seed/Series A startups',
      productDescription: 'AI-powered developer productivity platform',
      valueProposition: 'Ship faster with a smaller team using AI-assisted development workflows',
      tone: 'casual',
      emailLength: 'short',
      cta: 'Interested in seeing how we can help your team ship faster?',
      channel: 'email',
      sequenceSteps: 2,
      timezone: 'America/Los_Angeles',
      autoApprove: true,
      totalLeads: 20,
      createdById: regularUser.id,
    },
  });

  const campaign3 = await prisma.campaign.create({
    data: {
      name: 'Product Launch',
      description: 'Announcing our new analytics dashboard to qualified leads',
      status: 'completed',
      senderName: 'Jordan Rivera',
      senderEmail: 'jordan@leadflow-demo.example.com',
      replyToEmail: 'jordan@leadflow-demo.example.com',
      objective: 'Drive adoption of new analytics features among existing contacts',
      targetAudience: 'Previously engaged leads who showed interest',
      productDescription: 'New real-time analytics dashboard with AI insights',
      valueProposition: 'Get instant visibility into your development pipeline with AI-powered analytics',
      tone: 'professional',
      emailLength: 'medium',
      cta: 'Try the new dashboard free for 30 days',
      channel: 'email',
      sequenceSteps: 1,
      timezone: 'UTC',
      maxPerDay: 50,
      autoApprove: true,
      totalLeads: 15,
      emailsGenerated: 15,
      emailsSent: 15,
      emailsDelivered: 14,
      emailsOpened: 8,
      emailsClicked: 5,
      emailsReplied: 2,
      emailsBounced: 1,
      startedAt: randomDate(60),
      completedAt: randomDate(45),
      createdById: adminUser.id,
    },
  });

  const campaigns = [campaign1, campaign2, campaign3];
  console.log(`  Created ${campaigns.length} campaigns`);

  // ─── Campaign Leads ───
  console.log('Assigning leads to campaigns...');

  const campaign1Leads = leads.slice(0, 30);
  const campaign2Leads = leads.slice(30, 50);
  const campaign3Leads = leads.slice(50, 65);

  const campaignLeadStatuses1 = ['pending', 'email_generated', 'approved', 'sent', 'completed', 'failed'];

  for (const lead of campaign1Leads) {
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign1.id,
        leadId: lead.id,
        status: randomItem(campaignLeadStatuses1),
        sequenceStep: randomInt(1, 3),
      },
    });
  }

  for (const lead of campaign2Leads) {
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign2.id,
        leadId: lead.id,
        status: 'pending',
        sequenceStep: 1,
      },
    });
  }

  for (const lead of campaign3Leads) {
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign3.id,
        leadId: lead.id,
        status: 'completed',
        sequenceStep: 1,
      },
    });
  }

  console.log(`  Assigned ${campaign1Leads.length + campaign2Leads.length + campaign3Leads.length} campaign leads`);

  // ─── Email Messages ───
  console.log('Creating email messages...');

  const emailMessages = [];
  const emailStatuses = ['draft', 'generated', 'approved', 'sent', 'delivered', 'failed'];
  const emailSubjects = [
    'Quick question about {company}',
    'Idea for {company}\'s engineering team',
    '{name}, saw your recent post about scaling',
    'Helping teams like {company} ship faster',
    'Re: Developer productivity at {company}',
    '{name} - a different approach to {industry}',
  ];

  // Campaign 1 emails (some sent)
  for (let i = 0; i < 30; i++) {
    const lead = campaign1Leads[i % campaign1Leads.length];
    const isSent = i < 18;
    const status = isSent
      ? randomItem(['sent', 'delivered'])
      : randomItem(['draft', 'generated', 'approved']);

    const subject = randomItem(emailSubjects)
      .replace('{company}', lead.companyName || 'your company')
      .replace('{name}', lead.firstName || 'there')
      .replace('{industry}', lead.industry || 'tech');

    const email = await prisma.emailMessage.create({
      data: {
        campaignId: campaign1.id,
        leadId: lead.id,
        sequenceStep: randomInt(1, 3),
        subject,
        htmlBody: `<p>Hi ${lead.firstName},</p><p>I noticed that ${lead.companyName} is growing rapidly in the ${lead.industry || 'technology'} space. As ${lead.jobTitle}, you likely face challenges with scaling your team's productivity.</p><p>Our platform has helped similar companies reduce development cycle times by 40%. Would you be open to a quick 15-minute call this week to explore if this could help ${lead.companyName}?</p><p>Best,<br>Alex Thompson</p>`,
        textBody: `Hi ${lead.firstName}, I noticed that ${lead.companyName} is growing rapidly. As ${lead.jobTitle}, you likely face challenges with scaling your team's productivity. Our platform has helped similar companies reduce development cycle times by 40%. Would you be open to a quick 15-minute call this week? Best, Alex Thompson`,
        aiModel: 'anthropic/claude-3.5-sonnet',
        status,
        senderName: 'Alex Thompson',
        senderEmail: 'alex@leadflow-demo.example.com',
        recipientEmail: lead.email,
        recipientName: lead.fullName,
        provider: isSent ? 'brevo' : null,
        providerMessageId: isSent ? `<msg-${randomInt(100000, 999999)}@brevo.com>` : null,
        sentAt: isSent ? randomDate(25) : null,
        deliveredAt: isSent && status === 'delivered' ? randomDate(24) : null,
        channel: 'email',
      },
    });

    emailMessages.push(email);
  }

  // Campaign 3 emails (all sent/completed)
  for (let i = 0; i < 15; i++) {
    const lead = campaign3Leads[i];
    const email = await prisma.emailMessage.create({
      data: {
        campaignId: campaign3.id,
        leadId: lead.id,
        sequenceStep: 1,
        subject: `Introducing our new analytics dashboard - ${lead.firstName}`,
        htmlBody: `<p>Hi ${lead.firstName},</p><p>We just launched our new real-time analytics dashboard with AI-powered insights. Given ${lead.companyName}'s focus on ${lead.industry || 'data-driven decisions'}, I thought you might find this valuable.</p><p>Try it free for 30 days.</p><p>Best,<br>Jordan Rivera</p>`,
        textBody: `Hi ${lead.firstName}, We just launched our new analytics dashboard. Given ${lead.companyName}'s focus on ${lead.industry}, I thought you'd find this valuable. Try it free for 30 days. Best, Jordan Rivera`,
        aiModel: 'anthropic/claude-3.5-sonnet',
        status: 'delivered',
        senderName: 'Jordan Rivera',
        senderEmail: 'jordan@leadflow-demo.example.com',
        recipientEmail: lead.email,
        recipientName: lead.fullName,
        provider: 'brevo',
        providerMessageId: `<msg-c3-${randomInt(100000, 999999)}@brevo.com>`,
        sentAt: randomDate(55),
        deliveredAt: randomDate(54),
        channel: 'email',
      },
    });

    emailMessages.push(email);
  }

  // 5 standalone emails (not tied to campaign3 leads but part of campaign1 extras)
  for (let i = 0; i < 5; i++) {
    const lead = leads[65 + i];
    const email = await prisma.emailMessage.create({
      data: {
        leadId: lead.id,
        sequenceStep: 1,
        subject: `Following up - ${lead.companyName}`,
        htmlBody: `<p>Hi ${lead.firstName},</p><p>Just following up on my earlier message.</p>`,
        textBody: `Hi ${lead.firstName}, Just following up on my earlier message.`,
        status: 'draft',
        senderEmail: 'alex@leadflow-demo.example.com',
        recipientEmail: lead.email,
        recipientName: lead.fullName,
        channel: 'email',
      },
    });
    emailMessages.push(email);
  }

  console.log(`  Created ${emailMessages.length} email messages`);

  // ─── Email Events ───
  console.log('Creating email events...');

  const sentEmails = emailMessages.filter((e) => e.providerMessageId);
  const emailEventTypes = ['delivered', 'opened', 'clicked', 'bounced'];
  const emailEvents = [];

  for (let i = 0; i < 30 && i < sentEmails.length; i++) {
    const email = sentEmails[i];
    const eventType = i < 20
      ? randomItem(['delivered', 'opened'])
      : randomItem(emailEventTypes);

    const event = await prisma.emailEvent.create({
      data: {
        emailMessageId: email.id,
        eventType,
        provider: 'brevo',
        providerEventId: `brevo-evt-${randomInt(100000, 999999)}-${i}`,
        metadata: {
          email: email.recipientEmail,
          ...(eventType === 'clicked' ? { link: 'https://leadflow-demo.example.com/dashboard' } : {}),
          ...(eventType === 'bounced' ? { reason: 'Mailbox not found' } : {}),
        },
        occurredAt: randomDate(20),
      },
    });
    emailEvents.push(event);
  }

  console.log(`  Created ${emailEvents.length} email events`);

  // ─── Activities ───
  console.log('Creating activities...');

  const activityEventTypes: Array<{
    type: string;
    needsLead: boolean;
    needsCampaign: boolean;
    needsEmail: boolean;
  }> = [
    { type: 'lead.created', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'lead.imported', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'lead.updated', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'lead.enrichment.started', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'lead.enrichment.completed', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'lead.ai_analysis.completed', needsLead: true, needsCampaign: false, needsEmail: false },
    { type: 'email.generated', needsLead: true, needsCampaign: true, needsEmail: true },
    { type: 'email.approved', needsLead: true, needsCampaign: true, needsEmail: true },
    { type: 'email.sent', needsLead: true, needsCampaign: true, needsEmail: true },
    { type: 'email.delivered', needsLead: true, needsCampaign: true, needsEmail: true },
    { type: 'email.opened', needsLead: true, needsCampaign: true, needsEmail: true },
    { type: 'campaign.created', needsLead: false, needsCampaign: true, needsEmail: false },
    { type: 'campaign.started', needsLead: false, needsCampaign: true, needsEmail: false },
  ];

  const activities = [];
  for (let i = 0; i < 100; i++) {
    const actType = randomItem(activityEventTypes);
    const lead = actType.needsLead ? randomItem(leads) : null;
    const campaign = actType.needsCampaign ? randomItem(campaigns) : null;
    const email = actType.needsEmail && emailMessages.length > 0
      ? randomItem(emailMessages)
      : null;

    const activity = await prisma.activity.create({
      data: {
        eventType: actType.type,
        leadId: lead?.id,
        campaignId: campaign?.id,
        emailMessageId: email?.id,
        userId: randomItem([adminUser.id, regularUser.id]),
        provider: actType.type.startsWith('email.') ? 'brevo' : undefined,
        metadata: {
          source: actType.type.includes('import') ? randomItem(sources) : undefined,
          subject: email?.subject || undefined,
        },
        createdAt: randomDate(90),
      },
    });
    activities.push(activity);
  }

  console.log(`  Created ${activities.length} activities`);

  // ─── Summary ───
  console.log('\n--- Seed Complete ---');
  console.log(`Users: 2 (admin@leadflow.demo / user@leadflow.demo)`);
  console.log(`Companies: ${companies.length}`);
  console.log(`Tags: ${tags.length}`);
  console.log(`Leads: ${leads.length}`);
  console.log(`Tag Assignments: ${tagAssignments}`);
  console.log(`Enrichment Jobs: ${enrichmentJobs.length}`);
  console.log(`AI Analyses: ${aiAnalyses.length}`);
  console.log(`Campaigns: ${campaigns.length}`);
  console.log(`Email Messages: ${emailMessages.length}`);
  console.log(`Email Events: ${emailEvents.length}`);
  console.log(`Activities: ${activities.length}`);
  console.log(`\nLogin with: admin@leadflow.demo / password123`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
