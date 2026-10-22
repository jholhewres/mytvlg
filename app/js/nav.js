// Geometric focus helpers shared by the home rows and the sheets.
var Nav = {
    direction: function(e) {
        switch (e.keyCode) {
            case 37: return 'left';
            case 38: return 'up';
            case 39: return 'right';
            case 40: return 'down';
        }
        return '';
    },

    isBack: function(e) {
        return e.keyCode === 461 || e.keyCode === 27 || e.key === 'GoBack' || e.key === 'Escape';
    },

    // Nearest candidate in the given direction, favouring alignment on the cross axis.
    pick: function(current, candidates, dir) {
        var a = current.getBoundingClientRect();
        var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        var best = null, bestScore = Infinity;
        candidates.forEach(function(el) {
            if (el === current) return;
            var b = el.getBoundingClientRect();
            if (!b.width && !b.height) return;
            var bx = b.left + b.width / 2, by = b.top + b.height / 2;
            var main, cross;
            if (dir === 'down') { if (b.top < a.bottom - 8) return; main = by - ay; cross = Math.abs(bx - ax); }
            else if (dir === 'up') { if (b.bottom > a.top + 8) return; main = ay - by; cross = Math.abs(bx - ax); }
            else if (dir === 'right') { if (b.left < a.right - 8) return; main = bx - ax; cross = Math.abs(by - ay); }
            else { if (b.right > a.left + 8) return; main = ax - bx; cross = Math.abs(by - ay); }
            var score = main + cross * 2.5;
            if (score < bestScore) { bestScore = score; best = el; }
        });
        return best;
    }
};
