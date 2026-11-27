/*
 * Mock data for the NC Spark portfolio demo. Every person, company and email
 * address here is invented; the .example domain cannot receive mail.
 */
const DAY = 86400000;
const ago = (days, hours = 10) => new Date(Math.min(Date.now() - 60000, Date.now() - days * DAY + (hours - 12) * 3600000)).toISOString();
const dayOf = (iso) => iso.slice(0, 10);

let n = 0;
const id = (prefix) => {
  n += 1;
  const hex = (n + 0x1000).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${prefix}${hex.slice(prefix.length)}`;
};

export const DEMO_ACCOUNTS = [
  { email: 'trainee@ncspark.example', role: 'trainee', label: 'Trainee' },
  { email: 'trainer@ncspark.example', role: 'trainer', label: 'Trainer' },
  { email: 'supervisor@ncspark.example', role: 'supervisor', label: 'Supervisor' },
  { email: 'admin@ncspark.example', role: 'admin', label: 'Admin' },
];

const reading = (title, body, minutes = 4, xp = 10) => ({ type: 'reading', title, xp, content: { body, estimatedMinutes: minutes } });
const flashcards = (title, cards, xp = 10) => ({ type: 'flashcards', title, xp, content: { cards } });
const matching = (title, pairs, xp = 15) => ({ type: 'matching', title, xp, content: { pairs } });
const scenario = (title, description, steps, xp = 20) => ({ type: 'scenario', title, xp, content: { description, steps } });
const submission = (title, description, xp = 25) => ({ type: 'submission', title, xp, content: { description } });
const quizActivity = (title, quiz, xp = 30) => ({ type: 'quiz', title, xp, content: {}, quiz });
const choice = (cid, text, isCorrect, feedback) => ({ id: cid, text, isCorrect, feedback });

const COURSES = [
  {
    key: 'forklift', title: 'Forklift Safety Essentials', subtitle: 'Pre-use checks, load handling and pedestrian zones',
    description: 'Everything a new operator needs before their first shift on a counterbalance or reach truck.',
    icon: '🚚', color: '#e11d48', trainer: 'omar', status: 'published',
    modules: [
      { title: 'Before you drive', activities: [
        reading('The daily pre-use check', '## Why it matters\n\nMost forklift incidents start with a fault that a **two-minute check** would have caught.\n\n## The check\n\n- Tyres and forks: no cracks, no bent tips\n- Hydraulics: no leaks under the mast\n- Brakes, horn, lights and seat belt all work\n- Data plate is readable\n\nIf anything fails, **tag the truck out** and tell your supervisor. Never drive a truck that failed its check.', 5),
        flashcards('Key terms', [
          { front: 'Load centre', back: 'The distance from the fork face to the load\'s centre of gravity.' },
          { front: 'Data plate', back: 'The plate that states the truck\'s rated capacity at a given load centre.' },
          { front: 'Stability triangle', back: 'The area between the front wheels and the rear pivot; keep the combined centre of gravity inside it.' },
          { front: 'Tag-out', back: 'Labelling a faulty truck so nobody uses it until it is repaired.' },
        ]),
      ] },
      { title: 'On the floor', unlockAfterPrevious: true, activities: [
        scenario('A pedestrian steps out', 'You are reversing out of aisle 4 with a full pallet.', [
          { text: 'A picker steps out from behind the racking two metres behind you. What do you do first?', choices: [
            choice('a', 'Stop, sound the horn and wait for eye contact', true, 'Right. Stop first, then make sure they have seen you.'),
            choice('b', 'Keep reversing slowly, they will move', false, 'Never assume. Pedestrians always have priority.'),
            choice('c', 'Raise the forks so they can see you', false, 'Raising a load reduces stability and does not help visibility.'),
          ] },
          { text: 'They wave you on. The aisle exit is blind. How do you continue?', choices: [
            choice('a', 'Sound the horn at the junction and proceed at walking pace', true, 'Yes. Horn at every blind junction.'),
            choice('b', 'Speed up to clear the junction quickly', false, 'Speed is the main factor in junction collisions.'),
          ] },
        ]),
        matching('Signs and zones', [
          { term: 'Yellow walkway', definition: 'Pedestrians only, no trucks' },
          { term: 'Blue light', definition: 'A truck is approaching or reversing' },
          { term: 'Red tag', definition: 'Equipment is out of service' },
          { term: 'Chequered floor', definition: 'Shared crossing, give way to people' },
        ]),
        quizActivity('Check: loads and stability', {
          title: 'Loads and stability', pass_mark: 0.7, time_limit_seconds: null,
          questions: [
            { type: 'mcq', prompt: 'When should you travel with a raised load?', options: ['Whenever it is quicker', 'Only when stacking or unstacking', 'On ramps', 'Never above 2 metres'], key: { index: 1 }, explanation: 'Travel with forks low; raise only to stack or unstack.' },
            { type: 'truefalse', prompt: 'On a ramp, a loaded truck should drive with the load facing downhill.', key: { value: false }, explanation: 'Loaded: load faces uphill, so it cannot slide off.' },
            { type: 'mcq', prompt: 'What does the data plate tell you?', options: ['The service date', 'The rated capacity at a load centre', 'The operator\'s licence number', 'The top speed'], key: { index: 1 }, explanation: 'Capacity depends on the load centre.' },
          ],
        }),
      ] },
    ],
    final: {
      title: 'Forklift final assessment', pass_mark: 0.8, time_limit_seconds: 600,
      questions: [
        { type: 'mcq', prompt: 'A pre-use check finds a hydraulic leak. What next?', options: ['Drive carefully to the end of the shift', 'Tag the truck out and report it', 'Top up the oil and carry on', 'Ask a colleague to use it instead'], key: { index: 1 }, explanation: 'A failed check means the truck is tagged out.' },
        { type: 'truefalse', prompt: 'Pedestrians always have priority in shared zones.', key: { value: true }, explanation: 'Always.' },
        { type: 'truefalse', prompt: 'You may carry a passenger on the forks if the trip is short.', key: { value: false }, explanation: 'Never carry passengers.' },
        { type: 'mcq', prompt: 'At a blind junction you should…', options: ['Speed up', 'Sound the horn and slow down', 'Flash the lights only', 'Raise the forks'], key: { index: 1 }, explanation: 'Horn and walking pace.' },
      ],
    },
    materials: [{ name: 'Forklift pre-use checklist.pdf', kind: 'pdf' }, { name: 'Site traffic plan', kind: 'link' }],
  },
  {
    key: 'fire', title: 'Fire Safety & Evacuation', subtitle: 'Prevent, respond and get everyone out',
    description: 'Fire classes, extinguisher choice and your role when the alarm sounds.',
    icon: '🔥', color: '#f97316', trainer: 'omar', status: 'published',
    modules: [
      { title: 'Fire basics', activities: [
        reading('The fire triangle', '## Heat, fuel, oxygen\n\nTake away any one side and the fire goes out.\n\n- **Cooling** removes heat (water)\n- **Smothering** removes oxygen (foam, CO₂, fire blanket)\n- **Starving** removes fuel (shut off the gas)', 3),
        matching('Pick the extinguisher', [
          { term: 'Water', definition: 'Paper, wood and textiles (class A)' },
          { term: 'CO₂', definition: 'Electrical equipment' },
          { term: 'Foam', definition: 'Flammable liquids (class B)' },
          { term: 'Wet chemical', definition: 'Cooking oil fires (class F)' },
        ]),
      ] },
      { title: 'When the alarm sounds', unlockAfterPrevious: true, activities: [
        flashcards('Evacuation roles', [
          { front: 'Fire warden', back: 'Sweeps their area and reports it clear at the assembly point.' },
          { front: 'Assembly point', back: 'The agreed place outside where everyone is counted.' },
          { front: 'PEEP', back: 'Personal emergency evacuation plan for someone who needs help to leave.' },
        ]),
        scenario('Smoke in the packing area', 'It is 2 pm and the packing area is busy.', [
          { text: 'You smell smoke and see it coming from a charging station. First step?', choices: [
            choice('a', 'Raise the alarm at the nearest call point', true, 'Correct. Raise the alarm first.'),
            choice('b', 'Film it for the incident report', false, 'Your safety and the alarm come first.'),
            choice('c', 'Throw water on the charger', false, 'Never use water on electrical fires.'),
          ] },
        ]),
      ] },
    ],
    final: {
      title: 'Fire safety final assessment', pass_mark: 0.7, time_limit_seconds: null,
      questions: [
        { type: 'mcq', prompt: 'Which extinguisher suits an electrical fire?', options: ['Water', 'CO₂', 'Foam', 'Wet chemical'], key: { index: 1 }, explanation: 'CO₂ does not conduct.' },
        { type: 'truefalse', prompt: 'You should collect your belongings before evacuating.', key: { value: false }, explanation: 'Leave immediately.' },
        { type: 'paragraph', prompt: 'Describe your nearest escape route and assembly point.', key: { guidance: 'Name the exit, the route and the assembly point.' } },
      ],
    },
    materials: [{ name: 'Evacuation map.png', kind: 'image' }],
  },
  {
    key: 'manual', title: 'Manual Handling & Ergonomics', subtitle: 'Lift, carry and stack without injury',
    description: 'Safe lifting technique and how to set up a workstation that does not hurt.',
    icon: '🦺', color: '#0ea5e9', trainer: 'nour', status: 'published',
    modules: [
      { title: 'Lifting technique', activities: [
        reading('TILE: assess before you lift', '## T-I-L-E\n\n- **Task**: twisting, reaching, distance?\n- **Individual**: are you able and trained?\n- **Load**: weight, size, grip?\n- **Environment**: floor, light, space?', 4),
        scenario('An awkward box', 'A 25 kg box sits on the bottom shelf.', [
          { text: 'How do you lift it?', choices: [
            choice('a', 'Bend your knees, keep it close, no twisting', true, 'Good lift.'),
            choice('b', 'Bend at the waist and pull it out quickly', false, 'That loads your lower back.'),
          ] },
        ]),
        submission('Photo of your workstation', 'Upload a photo of your packing station after adjusting it using the checklist.'),
      ] },
    ],
    final: null,
    materials: [],
  },
  {
    key: 'data', title: 'Data Protection Basics', subtitle: 'Handling customer data on the warehouse floor',
    description: 'Labels, manifests and what to do with a misdelivered parcel.',
    icon: '⚖️', color: '#8b5cf6', trainer: 'nour', status: 'draft',
    modules: [
      { title: 'Personal data around you', activities: [
        reading('What counts as personal data', 'Names, addresses and phone numbers on labels are personal data. Shred spoiled labels; never photograph them.', 3),
      ] },
    ],
    final: null,
    materials: [],
  },
];

const PEOPLE = [
  { key: 'admin', name: 'Laila Hassan', email: 'admin@ncspark.example', role: 'admin', avatar: 'LH', joined: 60 },
  { key: 'karim', name: 'Karim Adel', email: 'supervisor@ncspark.example', role: 'supervisor', avatar: 'KA', joined: 55 },
  { key: 'omar', name: 'Omar Farouk', email: 'trainer@ncspark.example', role: 'trainer', avatar: 'OF', joined: 50 },
  { key: 'nour', name: 'Nour El-Din', email: 'nour.trainer@ncspark.example', role: 'trainer', avatar: 'NE', joined: 50 },
  { key: 'sara', name: 'Sara Mahmoud', email: 'trainee@ncspark.example', role: 'trainee', avatar: 'SM', joined: 30 },
  { key: 'youssef', name: 'Youssef Ali', email: 'youssef@ncspark.example', role: 'trainee', avatar: 'YA', joined: 28 },
  { key: 'mariam', name: 'Mariam Saeed', email: 'mariam@ncspark.example', role: 'trainee', avatar: 'MS', joined: 27 },
  { key: 'ahmed', name: 'Ahmed Nabil', email: 'ahmed@ncspark.example', role: 'trainee', avatar: 'AN', joined: 25 },
  { key: 'hana', name: 'Hana Fathy', email: 'hana@ncspark.example', role: 'trainee', avatar: 'HF', joined: 20 },
  { key: 'tarek', name: 'Tarek Mostafa', email: 'tarek@ncspark.example', role: 'trainee', avatar: 'TM', joined: 2, status: 'pending' },
];

/*
 * Who is enrolled where, how far they got, and what happened in the final.
 * done: number of activities completed in order; final: 'pass100' | 'pass' | 'fail' | 'review' | null.
 */
const PLAN = [
  { who: 'sara', course: 'forklift', status: 'active', done: 2, startedAgo: 6 },
  { who: 'sara', course: 'fire', status: 'completed', done: 'all', startedAgo: 20, final: 'pass100' },
  { who: 'youssef', course: 'fire', status: 'active', done: 'all', startedAgo: 15, final: 'review' },
  { who: 'youssef', course: 'forklift', status: 'active', done: 4, startedAgo: 12 },
  { who: 'mariam', course: 'forklift', status: 'active', done: 'all', startedAgo: 18, final: 'fail' },
  { who: 'mariam', course: 'manual', status: 'active', done: 1, startedAgo: 5 },
  { who: 'ahmed', course: 'forklift', status: 'completed', done: 'all', startedAgo: 22, final: 'pass' },
  { who: 'ahmed', course: 'fire', status: 'active', done: 1, startedAgo: 4 },
  { who: 'hana', course: 'forklift', status: 'pending', done: 0, startedAgo: 1 },
  { who: 'hana', course: 'fire', status: 'active', done: 3, startedAgo: 9 },
];

export function seedDatabase() {
  n = 0;
  const db = {
    profiles: [], trainee_stats: [], supervisor_trainers: [], allowed_domains: [], audit_log: [],
    courses: [], modules: [], activities: [], course_materials: [], enrollments: [], activity_completions: [],
    teaching_requests: [], quizzes: [], quiz_questions: [], quiz_answer_keys: [], quiz_attempts: [], quiz_answers: [],
    quiz_retake_grants: [], support_requests: [], support_messages: [], support_thread_keys: [], support_reads: [],
    messages: [], xp_events: [], user_activity: [], trainee_badges: [],
    badges: [
      { code: 'first_steps', name: 'First steps', description: 'Finished your first activity.', icon: 'spark', sort_order: 1 },
      { code: 'contributor', name: 'Contributor', description: 'Joined a course conversation.', icon: 'support', sort_order: 2 },
      { code: 'century', name: 'Century', description: 'Earned 100 XP.', icon: 'achievements', sort_order: 3 },
      { code: 'quiz_ace', name: 'Quiz ace', description: 'Scored full marks on a quiz.', icon: 'quiz', sort_order: 4 },
      { code: 'finisher', name: 'Finisher', description: 'Completed a whole course.', icon: 'complete', sort_order: 5 },
      { code: 'week_streak', name: 'Seven days', description: 'Earned something seven days running.', icon: 'trend', sort_order: 6 },
      { code: 'five_hundred', name: 'Five hundred', description: 'Earned 500 XP.', icon: 'target', sort_order: 7 },
    ],
  };

  const who = {};
  for (const p of PEOPLE) {
    const row = { id: id('a'), role: p.role, status: p.status ?? 'active', name: p.name, email: p.email,
      avatar: p.avatar, created_at: ago(p.joined), updated_at: ago(p.joined) };
    db.profiles.push(row);
    who[p.key] = row;
  }
  db.supervisor_trainers.push({ supervisor_id: who.karim.id, trainer_id: who.omar.id, created_at: ago(50) });
  db.supervisor_trainers.push({ supervisor_id: who.karim.id, trainer_id: who.nour.id, created_at: ago(50) });
  db.allowed_domains.push({ domain: 'ncspark.example', created_at: ago(60) });

  const course = {};
  for (const c of COURSES) {
    const row = { id: id('c'), slug: c.key, title: c.title, subtitle: c.subtitle, description: c.description,
      trainer_id: who[c.trainer].id, color: c.color, icon: c.icon, status: c.status, created_by: who.admin.id,
      created_at: ago(45), updated_at: ago(10) };
    db.courses.push(row);
    const acts = [];
    let prev = null;
    c.modules.forEach((m, mi) => {
      const mod = { id: id('d'), course_id: row.id, title: m.title, position: mi + 1,
        unlock_after_module_id: m.unlockAfterPrevious ? prev : null };
      db.modules.push(mod);
      prev = mod.id;
      m.activities.forEach((a, ai) => {
        const act = { id: id('e'), module_id: mod.id, type: a.type, title: a.title, position: ai + 1, xp: a.xp, content: a.content };
        db.activities.push(act);
        acts.push(act);
        if (a.quiz) act.quizId = addQuiz(db, row.id, act.id, a.quiz);
      });
    });
    const finalId = c.final ? addQuiz(db, row.id, null, c.final) : null;
    course[c.key] = { row, acts, finalId };
    for (const mat of c.materials) {
      db.course_materials.push({ id: id('f'), course_id: row.id, name: mat.name, kind: mat.kind,
        external_url: mat.kind === 'link' ? 'https://example.com/' : null,
        storage_path: mat.kind === 'link' ? null : `${row.id}/${mat.name}`, size_bytes: mat.kind === 'link' ? null : 184320,
        uploaded_by: who[c.trainer].id, created_at: ago(40) });
    }
  }
  db.teaching_requests.push({ id: id('g'), trainer_id: who.omar.id, course_id: course.manual.row.id, status: 'pending', created_at: ago(1) });

  const award = (trainee, courseId, kind, source, points, at) => {
    db.xp_events.push({ id: id('h'), trainee_id: trainee, course_id: courseId, kind, source_id: source, points, created_at: at });
  };

  for (const plan of PLAN) {
    const p = who[plan.who];
    const c = course[plan.course];
    const enr = { id: id('i'), trainee_id: p.id, course_id: c.row.id, status: plan.status,
      created_at: ago(plan.startedAgo + 1), decided_at: plan.status === 'pending' ? null : ago(plan.startedAgo),
      completed_at: plan.status === 'completed' ? ago(1) : null };
    db.enrollments.push(enr);
    const count = plan.done === 'all' ? c.acts.length : plan.done;
    c.acts.slice(0, count).forEach((a, i) => {
      const at = ago(Math.max(0, plan.startedAgo - i - 1), 9 + i);
      db.activity_completions.push({ id: id('j'), enrollment_id: enr.id, activity_id: a.id, payload: {}, completed_at: at });
      award(p.id, c.row.id, 'activity', a.id, a.xp, at);
      if (a.quizId) addAttempt(db, a.quizId, p.id, enr.id, 'pass', at, award, c.row.id, a.xp);
    });
    if (plan.final && c.finalId) addAttempt(db, c.finalId, p.id, enr.id, plan.final, ago(1, 15), award, c.row.id, 20);
  }

  // A few days of participation so the streak and charts have something to show.
  for (let d = 4; d >= 0; d -= 1) award(who.sara.id, course.forklift.row.id, 'participation', null, 2, ago(d, 11));

  const chat = [
    ['omar', 'Welcome to Forklift Safety! Ask anything here, there are no silly questions on a forklift.', 6],
    ['youssef', 'Is the pre-use check needed if someone already used the truck this morning?', 5],
    ['omar', 'Yes. Every operator, every shift. You cannot know what happened since.', 5],
    ['sara', 'The scenario about blind junctions was really useful, thanks.', 2],
  ];
  for (const [k, body, d] of chat) {
    db.messages.push({ id: id('k'), course_id: course.forklift.row.id, user_id: who[k].id, body, created_at: ago(d, 14) });
  }

  // Stats and badges, derived from the history exactly as the triggers would.
  for (const p of db.profiles.filter((x) => x.role === 'trainee')) {
    const events = db.xp_events.filter((x) => x.trainee_id === p.id);
    if (events.length === 0) continue;
    const days = new Set(events.map((e) => dayOf(e.created_at)));
    let streak = 0;
    for (let d = 0; days.has(dayOf(ago(d))); d += 1) streak += 1;
    const xp = events.reduce((s, e) => s + e.points, 0);
    const last = [...days].sort().pop();
    db.trainee_stats.push({ profile_id: p.id, xp, streak: Math.max(streak, 1), last_active_on: last });
    const earned = [];
    if (events.some((e) => e.kind === 'activity')) earned.push('first_steps');
    if (events.some((e) => e.kind === 'participation')) earned.push('contributor');
    if (xp >= 100) earned.push('century');
    if (xp >= 500) earned.push('five_hundred');
    if (db.quiz_attempts.some((a) => a.trainee_id === p.id && a.passed && Number(a.final_score) >= 100)) earned.push('quiz_ace');
    if (db.enrollments.some((e) => e.trainee_id === p.id && e.status === 'completed')) earned.push('finisher');
    for (const code of earned) db.trainee_badges.push({ trainee_id: p.id, badge_code: code, earned_at: last + 'T12:00:00.000Z' });
  }

  for (const p of db.profiles) {
    for (let d = 0; d < 30; d += 1) {
      if (p.status !== 'active' || (d * 7 + p.name.length) % 3 === 0) continue;
      db.user_activity.push({ user_id: p.id, day: dayOf(ago(d)), hits: 1 + ((d + p.name.length) % 5), last_seen_at: ago(d, 16) });
    }
  }

  const audit = [
    ['admin', 'course.publish', 'course', course.forklift.row.id, 40],
    ['admin', 'course.publish', 'course', course.fire.row.id, 38],
    ['admin', 'profile.set_role', 'profile', who.nour.id, 50],
    ['omar', 'enrollment.approve', 'enrollment', db.enrollments[0].id, 6],
    ['nour', 'enrollment.approve', 'enrollment', db.enrollments[2].id, 15],
  ];
  for (const [k, action, entity, entityId, d] of audit) {
    db.audit_log.push({ id: id('l'), actor_id: who[k].id, actor_email: who[k].email, action, entity_type: entity,
      entity_id: entityId, before: null, after: null, created_at: ago(d) });
  }
  return db;
}

function addQuiz(db, courseId, activityId, q) {
  const quizId = id('m');
  db.quizzes.push({ id: quizId, course_id: courseId, activity_id: activityId, title: q.title,
    pass_mark: q.pass_mark, time_limit_seconds: q.time_limit_seconds, created_at: new Date().toISOString() });
  q.questions.forEach((qq, i) => {
    const qid = id('n');
    db.quiz_questions.push({ id: qid, quiz_id: quizId, type: qq.type, position: i + 1, prompt: qq.prompt,
      options: qq.options ?? [], points: qq.type === 'paragraph' ? 2 : 1 });
    db.quiz_answer_keys.push({ question_id: qid, answer: qq.key, explanation: qq.explanation ?? null });
  });
  return quizId;
}

function addAttempt(db, quizId, traineeId, enrollmentId, outcome, at, award, courseId, xp) {
  const questions = db.quiz_questions.filter((q) => q.quiz_id === quizId);
  const keyOf = (qid) => db.quiz_answer_keys.find((k) => k.question_id === qid).answer;
  const gradable = questions.filter((q) => q.type !== 'paragraph');
  const wrong = outcome === 'fail' ? Math.ceil(gradable.length / 2) : 0;
  const attemptId = id('o');
  let earned = 0; let possible = 0;
  questions.forEach((q, i) => {
    const key = keyOf(q.id);
    let response = {}; let correct = null;
    if (q.type === 'paragraph') response = { text: 'Out through the loading bay doors on the east side, along the yellow walkway, to assembly point B in the car park.' };
    else {
      correct = i >= wrong;
      if (q.type === 'mcq') response = { index: correct ? key.index : (key.index + 1) % q.options.length };
      else response = { value: correct ? key.value : !key.value };
      possible += q.points; if (correct) earned += q.points;
    }
    db.quiz_answers.push({ id: id('p'), attempt_id: attemptId, question_id: q.id, response, is_correct: correct,
      awarded: correct === null ? null : (correct ? q.points : 0), comment: null });
  });
  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const review = outcome === 'review';
  const passed = review ? null : outcome !== 'fail' && score >= 70;
  db.quiz_attempts.push({ id: attemptId, quiz_id: quizId, trainee_id: traineeId, enrollment_id: enrollmentId, attempt_no: 1,
    status: review ? 'pending_review' : passed ? 'passed' : 'failed', started_at: at, submitted_at: at,
    graded_at: review ? null : at, graded_by: null, auto_score: score, final_score: review ? null : score, passed });
  if (passed) award(traineeId, courseId, 'quiz', quizId, Math.max(1, Math.round((xp * score) / 100)), at);
}
