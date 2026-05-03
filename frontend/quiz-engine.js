// ===============================
// QUIZ ENGINE (FULLY FIXED)
// ===============================

// Make Quiz global
window.Quiz = {
  currentQuiz: [],
  answers: [],
  index: 0,

  init(quiz, topic, difficulty, mode) {
    this.currentQuiz = quiz;
    this.answers = new Array(quiz.length).fill(null);
    this.index = 0;

    document.getElementById("quiz-topbar").style.display = "flex";
    document.getElementById("progress-wrap").style.display = "block";
    document.getElementById("submit-row").style.display = "block";

    this.render();
  },

  render() {
    const quiz = this.currentQuiz;
    const container = document.getElementById("quiz");
    container.innerHTML = "";

    quiz.forEach((q, i) => {
      const div = document.createElement("div");
      div.className = "quiz-card";

      div.innerHTML = `
        <p><strong>Q${i + 1}:</strong> ${q.question}</p>
        ${q.options.map(opt => `
          <label>
            <input type="radio" name="q${i}" value="${opt}"
              ${this.answers[i] === opt ? "checked" : ""}>
            ${opt}
          </label><br/>
        `).join("")}
      `;

      container.appendChild(div);
    });

    this.bind();
    this.updateProgress();
  },

  bind() {
    document.querySelectorAll("input[type=radio]").forEach(input => {
      input.addEventListener("change", (e) => {
        const qIndex = parseInt(e.target.name.replace("q", ""));
        this.answers[qIndex] = e.target.value;
      });
    });
  },

  updateProgress() {
    const total = this.currentQuiz.length;
    const answered = this.answers.filter(a => a !== null).length;

    document.getElementById("progress-frac").innerText =
      `${answered} / ${total}`;

    document.getElementById("progress-fill").style.width =
      `${(answered / total) * 100}%`;
  },

  submit() {
    let score = 0;

    this.currentQuiz.forEach((q, i) => {
      if (this.answers[i] === q.correctAnswer) score++;
    });

    alert(`Score: ${score}/${this.currentQuiz.length}`);
  }
};

// ===============================
// GENERATE QUIZ (FIXED)
// ===============================

window.generateQuiz = async function () {
  const topic = document.getElementById("topic-input").value;

  if (!topic) {
    alert("Enter a topic");
    return;
  }

  try {
    const data = await Auth.apiFetch("/api/topic-quiz", {
      method: "POST",
      body: JSON.stringify({ topic })
    });

    // FIX: backend returns ARRAY directly
    sessionStorage.setItem("pendingQuiz", JSON.stringify({
      quiz: data,
      topic: topic,
      difficulty: "medium"
    }));

    window.location.href = "play.html";

  } catch (err) {
    console.error(err);
    alert("Quiz generation failed");
  }
};