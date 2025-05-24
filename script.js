// script.js

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tablink").forEach(btn =>
    btn.addEventListener("click", () => openTab(btn.dataset.tab, btn))
  );
  openTab("introTab", document.querySelector(".tablink.active"));
});

function openTab(tabId, btn) {
  document.querySelectorAll(".tabcontent").forEach(s => s.style.display = "none");
  document.querySelectorAll(".tablink").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
  if (tabId === "mrsTab") renderMRSChart();
  if (tabId === "probTab") renderUptakeChart();
  if (tabId === "costsTab") renderCostsBenefits();
}

// Utility
function getCurrency(country) {
  return country === "Australia" ? "A$" : "€";
}

// Coefficients (based on EC-logit lit review)
const vaxCoefficients = {
  scopeAll: 0.7,            // All occupations vs reference
  exemptionMedRel: 0.4,     // Medical+religious
  exemptionAll: 0.8,        // + personal beliefs
  coverageModerate: -0.6,   // 70% vs 50%
  coverageHigh: -1.2,       // 90% vs 50%
  livesSavedCoeff: 0.05     // per life saved per 100k
};

// Cost & Benefit params
const colMultipliers = { Australia:1, France:0.95, Italy:0.9 };
const costParams = {
  Australia:{fixed:200000, variable:50},
  France:{fixed:180000, variable:45},
  Italy:{fixed:160000, variable:40}
};
const benefitScenarios = { low:400, medium:500, high:600 };

function computeCostBenefits(country, participants, adjustCOL) {
  const m = adjustCOL==="yes"? colMultipliers[country]:1;
  const {fixed,variable} = costParams[country];
  const fixedCost = fixed * m;
  const varCost = variable * participants * m;
  const totalCost = fixedCost + varCost;
  const benefitPer = benefitScenarios[document.getElementById("benefitScenario").value];
  const totalBenefit = benefitPer * participants;
  return {
    fixedCost, variableCost:varCost, totalCost,
    benefitPerParticipant:benefitPer, totalBenefit,
    netBenefit: totalBenefit - totalCost
  };
}

function buildScenarioFromInputs() {
  const country = document.getElementById("country_select")?.value || "Australia";
  const adjustCOL = document.getElementById("adjustCOL")?.value || "no";

  // Scope
  const scopeAll = !!document.querySelector('input[name="scope"]:checked');
  const scopeText = scopeAll ? "All occupations…" : "High-risk occupations only";

  // Exemption
  const ex = document.querySelector('input[name="exemption"]:checked')?.value || "";
  const exemptionText = ex==="medRel"
    ? "Medical + religious"
    : ex==="all"
      ? "Medical, religious + personal beliefs"
      : "Medical only";

  // Coverage
  const cov = document.querySelector('input[name="coverage"]:checked')?.value || "";
  const coverageText = cov==="70"
    ? "70% vaccinated"
    : cov==="90"
      ? "90% vaccinated"
      : "50% vaccinated";

  // Lives Saved (slider)
  const lives = parseInt(document.getElementById("livesSaved").value,10);

  // Utility
  let u = 0;
  if(scopeAll) u += vaxCoefficients.scopeAll;
  if(ex==="medRel") u += vaxCoefficients.exemptionMedRel;
  if(ex==="all")    u += vaxCoefficients.exemptionAll;
  if(cov==="70")    u += vaxCoefficients.coverageModerate;
  if(cov==="90")    u += vaxCoefficients.coverageHigh;
  u += lives * vaxCoefficients.livesSavedCoeff;

  const uptakeProb = 1 / (1 + Math.exp(-u));
  const uptakePct  = (uptakeProb*100).toFixed(1);
  const participants = Math.round(uptakeProb * 2000);

  const costs = computeCostBenefits(country, participants, adjustCOL);

  return { country, scopeText, exemptionText, coverageText, lives, uptakePct, participants, ...costs };
}

function calculateScenario() {
  const s = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const html = `
    <h4>Scenario Results</h4>
    <p><strong>Scope:</strong> ${s.scopeText}</p>
    <p><strong>Exemption:</strong> ${s.exemptionText}</p>
    <p><strong>Coverage:</strong> ${s.coverageText}</p>
    <p><strong>Lives Saved:</strong> ${s.lives}</p>
    <p><strong>Uptake:</strong> ${s.uptakePct}%</p>
    <p><strong>Participants:</strong> ${s.participants}</p>
    <p><strong>Net Benefit:</strong> ${cur}${s.netBenefit.toFixed(2)}</p>
  `;
  document.getElementById("modalResults").innerHTML = html;
  document.getElementById("resultModal").style.display = "block";
}
function closeModal() {
  document.getElementById("resultModal").style.display = "none";
}

function showUptakeRecommendations() {
  const s = buildScenarioFromInputs();
  let rec = "<h4>Recommendations</h4>";
  if (s.uptakePct < 40) rec += "<p>Uptake low: strengthen incentives & communication.</p>";
  else if (s.uptakePct < 60) rec += "<p>Moderate: review coverage requirements.</p>";
  else rec += "<p>High: maintain current policy and monitor.</p>";
  rec += `<p><strong>Participants:</strong> ${s.participants}</p>`;
  document.getElementById("uptakeResults").innerHTML = rec;
  document.getElementById("uptakeModal").style.display = "block";
}
function closeUptakeModal() {
  document.getElementById("uptakeModal").style.display = "none";
}

let mrsChart, uptakeChart, combinedChart;
function renderMRSChart() {
  const ctx = document.getElementById("mrsChart").getContext("2d");
  if (mrsChart) mrsChart.destroy();
  // MRS: coverage vs lives saved
  const mrs70 = -(vaxCoefficients.coverageModerate)/(vaxCoefficients.livesSavedCoeff);
  const mrs90 = -(vaxCoefficients.coverageHigh)/(vaxCoefficients.livesSavedCoeff);
  mrsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["70% vs lives","90% vs lives"],
      datasets:[{label:"Lives",data:[mrs70,mrs90]}]
    },
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
  document.getElementById("mrsInfo").innerHTML = `
    <p>An MRS of ${mrs70.toFixed(1)} means you need that many lives saved to compensate for shifting coverage from 50% to 70%.</p>
  `;
}

function renderUptakeChart() {
  const s = buildScenarioFromInputs();
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  if (uptakeChart) uptakeChart.destroy();
  uptakeChart = new Chart(ctx, {
    type: "doughnut",
    data:{labels:["Uptake","Non-uptake"],datasets:[{data:[s.uptakePct,100-s.uptakePct]}]},
    options:{responsive:true,plugins:{title:{display:true,text:`Uptake ${s.uptakePct}%`}}}
  });
}

function renderCostsBenefits() {
  const s = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  const cb = computeCostBenefits(s.country,s.participants, document.getElementById("adjustCOL")?.value);
  const container = document.getElementById("costsBenefitsResults");
  container.innerHTML = `
    <div class="card cost-card"><h4>Fixed Cost</h4><p>${cur}${cb.fixedCost.toFixed(2)}</p></div>
    <div class="card cost-card"><h4>Variable Cost</h4><p>${cur}${cb.variableCost.toFixed(2)}</p></div>
    <div class="card cost-card"><h4>Total Cost</h4><p>${cur}${cb.totalCost.toFixed(2)}</p></div>
    <div class="card cost-card"><h4>Total Benefit</h4><p>${cur}${cb.totalBenefit.toFixed(2)}</p></div>
    <div class="card cost-card"><h4>Net Benefit</h4><p>${cur}${cb.netBenefit.toFixed(2)}</p></div>
    <div id="combinedChartContainer"><canvas id="combinedChart"></canvas></div>
  `;
  const ctx2 = document.getElementById("combinedChart").getContext("2d");
  if (combinedChart) combinedChart.destroy();
  combinedChart = new Chart(ctx2,{
    type:"bar",
    data:{
      labels:["Cost","Benefit","Net"],
      datasets:[{label:cur,data:[cb.totalCost,cb.totalBenefit,cb.netBenefit]}]
    },
    options:{responsive:true}
  });
}

// Scenario saving
let savedScenarios = [];
function saveScenario() {
  const s = buildScenarioFromInputs();
  const cur = getCurrency(s.country);
  s.name = `Scenario ${savedScenarios.length+1}`;
  savedScenarios.push(s);
  const row = document.createElement("tr");
  ["name","scopeText","exemptionText","coverageText","lives","uptakePct","netBenefit"].forEach(key=>{
    const td = document.createElement("td");
    td.textContent = key==="netBenefit" 
      ? cur + s[key].toFixed(2)
      : s[key];
    row.appendChild(td);
  });
  document.querySelector("#scenarioTable tbody").appendChild(row);
  alert(`Saved ${s.name}`);
}

function openComparison() {
  if (savedScenarios.length < 2) return alert("Need ≥2 scenarios.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y=20;
  doc.setFontSize(16).text("Scenario Comparison",105,10,{align:"center"});
  savedScenarios.forEach((s,i)=>{
    doc.setFontSize(12).text(`${s.name}`,10,y); y+=6;
    doc.text(`Scope: ${s.scopeText}`,10,y); y+=5;
    doc.text(`Exemption: ${s.exemptionText}`,10,y); y+=5;
    doc.text(`Coverage: ${s.coverageText}`,10,y); y+=5;
    doc.text(`Lives: ${s.lives}`,10,y); y+=5;
    doc.text(`Uptake: ${s.uptakePct}%`,10,y); y+=5;
    doc.text(`Net Benefit: ${getCurrency(s.country)}${s.netBenefit.toFixed(2)}`,10,y); y+=10;
    if (y>260) { doc.addPage(); y=20; }
  });
  doc.save("comparison.pdf");
}

function downloadCSV() {
  if (!savedScenarios.length) return alert("No scenarios.");
  let csv = "Name,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
  savedScenarios.forEach(s=>{
    csv += [
      s.name,
      s.scopeText,
      s.exemptionText,
      s.coverageText,
      s.lives,
      s.uptakePct,
      getCurrency(s.country)+s.netBenefit.toFixed(2)
    ].join(",") + "\n";
  });
  const link = document.createElement("a");
  link.href = encodeURI("data:text/csv;charset=utf-8,"+csv);
  link.download = "scenarios.csv";
  link.click();
}
